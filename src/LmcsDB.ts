import { v7 as uuidv7 } from 'uuid';
import EncryptionService from './EncryptionService';
import InMemoryStorage from './storage/InMemoryStorage';
import JsonStorage from './storage/JsonStorage';
import BinaryStorage from './storage/BinaryStorage';
import AolStorage from './storage/AolStorage';
import { DatabaseConfig, DatabaseDocument, DatabaseSchema, FindOptions, IDatabaseStorage, LogEntry } from './interfaces';
import AsyncWriteWorker from './persistence/AsyncWriteWorker';

class LmcsDB {
  private storage: IDatabaseStorage;
  private schema: DatabaseSchema = { collections: {} };
  private encryptionService?: EncryptionService;
  private config: DatabaseConfig;
  private writeWorker?: AsyncWriteWorker;
  private appendWorker?: AsyncWriteWorker;
  // collection -> field -> value -> Set<id>
  private runtimeIndices: Record<string, Record<string, Map<any, Set<string>>>> = {};
  private compactionTimer?: NodeJS.Timeout;

  constructor(config: DatabaseConfig) {
    this.config = config;

    // Configurar armazenamento
    switch (config.storageType) {
      case 'memory':
        this.storage = new InMemoryStorage();
        break;
      case 'json':
        this.storage = new JsonStorage(config.databaseName || 'default', config.customPath);
        break;
      case 'binary':
        this.storage = new BinaryStorage(config.databaseName || 'default', config.customPath);
        break;
      case 'aol':
        this.storage = new AolStorage(config.databaseName || 'default', config.customPath);
        break;
      default:
        throw new Error('Invalid storage type');
    }

    // Configurar criptografia se a chave for fornecida
    if (config.encryptionKey) {
      this.encryptionService = new EncryptionService(config.encryptionKey);
    }

    // Configurar compactação automática se definido (Apenas AOL)
    if (config.storageType === 'aol') {
      // Default de 1 minuto se não definido
      const interval = config.compactionInterval !== undefined ? config.compactionInterval : 60000;
      
      if (interval > 0) {
        this.compactionTimer = setInterval(() => {
          this.compact().catch(err => console.error('Auto-compaction failed:', err));
        }, interval);
        
        // Não bloquear o processo se apenas o timer estiver rodando
        if (this.compactionTimer.unref) {
          this.compactionTimer.unref();
        }
      }
    }

    // Worker para Save Completo (Snapshot)
    this.writeWorker = new AsyncWriteWorker(async () => {
      let rawData = JSON.stringify(this.schema);
      if (this.encryptionService) {
        rawData = this.encryptionService.encrypt(rawData);
      }
      await this.storage.save(rawData);
    });
  }

  private appendQueue: LogEntry[] = [];
  private isAppending = false;

  private async processAppendQueue() {
    if (this.isAppending) return;
    this.isAppending = true;

    while (this.appendQueue.length > 0) {
      const entry = this.appendQueue.shift();
      if (entry && this.storage.append) {
        try {
          await this.storage.append(entry);
        } catch (error) {
          console.error('Error appending to log:', error);
        }
      }
    }

    this.isAppending = false;
  }
  
  private async persistOperation(entry: LogEntry) {
    if (this.storage.append) {
      let finalEntry = entry;
      if (this.encryptionService && entry.doc) {
        const docStr = JSON.stringify(entry.doc);
        finalEntry = { ...entry, doc: this.encryptionService.encrypt(docStr) };
      }

      this.appendQueue.push(finalEntry);
      this.processAppendQueue();
      
    } else {
      await this.save();
    }
  }

  async save(): Promise<void> {
    if (this.writeWorker) {
      this.writeWorker.trigger();
      return;
    }
    
    let rawData = JSON.stringify(this.schema);
    if (this.encryptionService) {
      rawData = this.encryptionService.encrypt(rawData);
    }
    await this.storage.save(rawData);
  }

  async flush(): Promise<void> {
    if (this.storage.append) {
        while (this.isAppending || this.appendQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return;
    }

    await this.save();
    if (this.writeWorker) {
      await this.writeWorker.flush();
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), obj);
  }

  private addToIndex(collectionName: string, doc: DatabaseDocument) {
    const collection = this.schema.collections[collectionName];
    if (!collection || !collection.indices) return;

    for (const field of Object.keys(collection.indices)) {
      const value = this.getNestedValue(doc, field);
      // We index null/undefined as well if they exist in the document? 
      // For simplicity, let's only index defined values for now unless we want sparse indexes.
      // But for correct querying of "exists", we might need it.
      // Let's stick to values that are not undefined.
      if (value === undefined) continue;

      if (!this.runtimeIndices[collectionName]) this.runtimeIndices[collectionName] = {};
      if (!this.runtimeIndices[collectionName][field]) this.runtimeIndices[collectionName][field] = new Map();

      const indexMap = this.runtimeIndices[collectionName][field];
      if (!indexMap.has(value)) {
        indexMap.set(value, new Set());
      }
      
      // Check unique constraint before adding would be better, but here we just add.
      // Validation should happen before calling this.
      indexMap.get(value)!.add(doc._id);
    }
  }

  private removeFromIndex(collectionName: string, doc: DatabaseDocument) {
    const collection = this.schema.collections[collectionName];
    if (!collection || !collection.indices) return;

    for (const field of Object.keys(collection.indices)) {
      const value = this.getNestedValue(doc, field);
      if (value === undefined) continue;

      if (this.runtimeIndices[collectionName] && this.runtimeIndices[collectionName][field]) {
        const indexMap = this.runtimeIndices[collectionName][field];
        if (indexMap.has(value)) {
          const set = indexMap.get(value)!;
          set.delete(doc._id);
          if (set.size === 0) {
            indexMap.delete(value);
          }
        }
      }
    }
  }

  private rebuildIndices() {
    this.runtimeIndices = {};
    for (const [colName, collection] of Object.entries(this.schema.collections)) {
      if (collection.indices) {
        for (const doc of Object.values(collection.documents)) {
          this.addToIndex(colName, doc);
        }
      }
    }
  }

  async initialize(): Promise<void> {
    let rawData = await this.storage.load();

    // Se o storage retornou um JSON completo (snapshot ou load tradicional)
    // O AolStorage.load() já retorna o JSON reconstruído do log.
    // Mas precisamos lidar com a decriptografia SE o storage retornou dados encriptados.
    // O AolStorage retorna JSON.stringify(schema). Se houver dados encriptados NO ARQUIVO (Full Snapshot encriptado),
    // o load() retornaria a string encriptada?
    // 
    // No caso do BinaryStorage/JsonStorage:
    // load() retorna string encriptada (se encryptionService ativo no save).
    //
    // No caso do AolStorage:
    // O load() processa linha a linha. Se as linhas tiverem 'doc' encriptado, ele precisa decriptar DURANTE o load.
    // O AolStorage não tem acesso ao EncryptionService.
    //
    // Solução:
    // Precisamos passar o EncryptionService para o AolStorage ou fazer o AolStorage retornar um formato intermediário?
    //
    // Se passarmos a responsabilidade para o AolStorage, ferimos a arquitetura atual onde o Storage é "burro".
    // 
    // Alternativa: O AolStorage.load() retorna o schema onde os documentos podem estar encriptados (strings).
    // E aqui no initialize, percorremos o schema e decriptamos se necessário.
    
    // Vamos ver como está o initialize atual:
    // 1. Decripta rawData se for encriptado.
    // 2. Parse JSON.
    
    // Se AolStorage retorna JSON válido (schema), ele NÃO está encriptado globalmente (como string inteira).
    // Mas seus documentos internos podem estar.
    
    // Então, se config.storageType === 'aol' e encryptionKey existe:
    // O rawData é um JSON Schema válido, mas os docs podem ser strings encriptadas.
    
    if (this.config.storageType !== 'aol') {
        // Fluxo tradicional (Binary/Json/Memory)
        if (this.encryptionService && rawData && rawData.trim() !== '' && rawData !== '{}') {
          try {
            rawData = this.encryptionService.decrypt(rawData);
          } catch (error) {
            console.error('Decryption failed. Starting with empty database.', error);
            rawData = '{}';
          }
        }
    }

    // Parse dos dados
    try {
      this.schema = JSON.parse(rawData || '{}');
      if (!this.schema.collections) {
        this.schema.collections = {};
      }
      
      // Pós-processamento para AOL Encriptado
      if (this.config.storageType === 'aol' && this.encryptionService) {
         for (const col of Object.values(this.schema.collections)) {
            for (const [id, doc] of Object.entries(col.documents)) {
                // Se o doc for uma string, assumimos que é encriptado
                if (typeof doc === 'string') {
                    try {
                        const decryptedStr = this.encryptionService.decrypt(doc);
                        col.documents[id] = JSON.parse(decryptedStr);
                    } catch (e) {
                        console.error(`Failed to decrypt document ${id} in collection ${col.name}`, e);
                        // Mantém como está ou remove? Vamos manter para não perder dados, mas será inutilizável.
                    }
                }
            }
         }
      }
      
    } catch (error) {
      console.error('Failed to parse database. Starting with empty database.', error);
      this.schema = { collections: {} };
    }

    this.rebuildIndices();
  }

  getPersistenceStats() {
    return this.writeWorker ? this.writeWorker.getStats() : undefined;
  }

  collection<T extends DatabaseDocument>(name: string) {
    return {
      createIndex: async (field: string, options: { unique?: boolean } = {}) => {
        if (!this.schema.collections[name]) {
           this.schema.collections[name] = { name, documents: {} };
        }
        if (!this.schema.collections[name].indices) {
          this.schema.collections[name].indices = {};
        }
        this.schema.collections[name].indices[field] = options;
        
        // Rebuild indices for this collection to ensure consistency
        const collection = this.schema.collections[name];
        // Clear existing runtime index for this field if any
        if (this.runtimeIndices[name] && this.runtimeIndices[name][field]) {
            delete this.runtimeIndices[name][field];
        }
        
        for (const doc of Object.values(collection.documents)) {
           this.addToIndex(name, doc);
        }
        
        this.save().catch(() => {});
      },

      insert: async (document: Omit<T, '_id'>): Promise<T> => {
        if (!this.schema.collections) {
          this.schema.collections = {};
        }

        if (!this.schema.collections[name]) {
          this.schema.collections[name] = { name, documents: {} };
        }

        const id = uuidv7();
        const newDoc = { _id: id, ...document } as T;

        this.schema.collections[name].documents[id] = newDoc;
        this.addToIndex(name, newDoc);
        
        this.persistOperation({
          op: 'i',
          col: name,
          id,
          doc: newDoc
        }).catch(() => {});
        
        return newDoc;
      },

      find: async (id: string): Promise<T | null> => {
        const collection = this.schema.collections[name];
        if (!collection) return null;
        return (collection.documents[id] as T) || null;
      },

      findAll: async (options?: FindOptions<T>): Promise<T[]> => {
        const collection = this.schema.collections[name];
        if (!collection) return [];

        let candidates: Set<string> | null = null;

        // Optimization: Check if we can use indices
        if (options?.filter && this.runtimeIndices[name]) {
          for (const [key, value] of Object.entries(options.filter)) {
            if (this.runtimeIndices[name][key]) {
              const indexMap = this.runtimeIndices[name][key];
              let foundIds: Set<string> = new Set();
              
              // Direct equality: field: "value"
              if (typeof value !== 'object') {
                if (indexMap.has(value)) {
                  foundIds = indexMap.get(value)!;
                }
              } 
              // $eq operator
              else if (value && (value as any).$eq !== undefined) {
                 const v = (value as any).$eq;
                 if (indexMap.has(v)) {
                   foundIds = indexMap.get(v)!;
                 }
              }
              // $in operator
              else if (value && (value as any).$in !== undefined) {
                 const vs = (value as any).$in as any[];
                 for (const v of vs) {
                   if (indexMap.has(v)) {
                     for (const id of indexMap.get(v)!) {
                       foundIds.add(id);
                     }
                   }
                 }
              } else {
                continue; // Cannot optimize other operators with Hash Index
              }

              if (candidates === null) {
                candidates = new Set(foundIds);
              } else {
                // Intersection
                candidates = new Set([...candidates].filter((x: string) => foundIds.has(x)));
              }
            }
          }
        }

        let documents: T[];
        if (candidates !== null) {
          documents = [];
          for (const id of candidates) {
            if (collection.documents[id]) {
              documents.push(collection.documents[id] as T);
            }
          }
        } else {
          documents = Object.values(collection.documents) as T[];
        }

        // Apply filter (full check)
        if (options?.filter) {
          documents = documents.filter(doc => {
            const match = (currentDoc: T, filter: any): boolean => {
               return Object.entries(filter).every(([key, value]) => {
                  if (key === '$or') {
                    return (value as any[]).some(subFilter => match(currentDoc, subFilter));
                  }
                  if (key === '$and') {
                    return (value as any[]).every(subFilter => match(currentDoc, subFilter));
                  }
                  
                  const docValue = this.getNestedValue(currentDoc, key);

                  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const operators = value as Record<string, any>;

                    if (operators.$eq !== undefined && docValue !== operators.$eq) return false;
                    if (operators.$ne !== undefined && docValue === operators.$ne) return false;
                    if (operators.$gt !== undefined && docValue <= operators.$gt) return false;
                    if (operators.$lt !== undefined && docValue >= operators.$lt) return false;
                    if (operators.$in !== undefined && !operators.$in.includes(docValue)) return false;
                    if (operators.$nin !== undefined && operators.$nin.includes(docValue)) return false;
                    if (operators.$contains !== undefined && (typeof docValue !== 'string' || !docValue.includes(operators.$contains))) return false;
                    if (operators.$regex !== undefined && !new RegExp(operators.$regex).test(String(docValue))) return false;
                    if (operators.$exists !== undefined && (docValue !== undefined) !== operators.$exists) return false;
                    if (operators.$startsWith !== undefined && (typeof docValue !== 'string' || !docValue.startsWith(operators.$startsWith))) return false;
                    if (operators.$endsWith !== undefined && (typeof docValue !== 'string' || !docValue.endsWith(operators.$endsWith))) return false;
                    if (operators.$between !== undefined && (docValue < operators.$between[0] || docValue > operators.$between[1])) return false;

                    return true;
                  }

                  return docValue === value;
               });
            };
            return match(doc, options.filter);
          });
        }

        // Apply sorting
        if (options?.sort) {
          const [sortKey, sortDirection] = Object.entries(options.sort)[0];
          documents.sort((a, b) => {
            const aValue = this.getNestedValue(a, sortKey);
            const bValue = this.getNestedValue(b, sortKey);

            if (aValue < bValue) return sortDirection === 1 ? -1 : 1;
            if (aValue > bValue) return sortDirection === 1 ? 1 : -1;
            return 0;
          });
        }

        // Apply limit
        if (options?.limit) {
          documents = documents.slice(0, options.limit);
        }

        return documents;
      },

      update: async (id: string, update: Partial<T>): Promise<T | null> => {
        const collection = this.schema.collections[name];
        if (!collection || !collection.documents[id]) return null;

        const oldDoc = collection.documents[id] as T;
        this.removeFromIndex(name, oldDoc);

        const updatedDoc = {
          ...oldDoc,
          ...update,
          _id: id 
        } as T;

        collection.documents[id] = updatedDoc;
        this.addToIndex(name, updatedDoc);
        
        this.persistOperation({
          op: 'u',
          col: name,
          id,
          doc: updatedDoc
        }).catch(() => {});
        
        return updatedDoc;
      },

      delete: async (id: string): Promise<boolean> => {
        const collection = this.schema.collections[name];
        if (!collection || !collection.documents[id]) return false;

        const doc = collection.documents[id] as T;
        this.removeFromIndex(name, doc);
        
        delete collection.documents[id];

        if (Object.keys(collection.documents).length === 0) {
          delete this.schema.collections[name];
          if (this.runtimeIndices[name]) {
             delete this.runtimeIndices[name];
          }
        }

        this.persistOperation({
          op: 'd',
          col: name,
          id
        }).catch(() => {});
        
        return true;
      },

      count: async (options?: FindOptions<T>): Promise<number> => {
        if (options) {
          return (await this.collection(name).findAll(options)).length;
        }

        const collection = this.schema.collections[name];
        return collection ? Object.keys(collection.documents).length : 0;
      }

    };
  }
  async compact(): Promise<void> {
    if (this.storage.compact) {
      // Pause appending while compacting
      this.isAppending = true;
      try {
        await this.storage.compact(this.schema, this.encryptionService);
      } finally {
        this.isAppending = false;
        // Resume queue if needed
        this.processAppendQueue();
      }
    }
  }

  async close(): Promise<void> {
    if (this.compactionTimer) {
        clearInterval(this.compactionTimer);
        this.compactionTimer = undefined;
    }
    await this.flush();
  }
}

export default LmcsDB;
