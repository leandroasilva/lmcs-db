import { v4 as uuidv4 } from 'uuid';
import EncryptionService from './EncryptionService';
import InMemoryStorage from './storage/InMemoryStorage';
import JsonStorage from './storage/JsonStorage';
import BinaryStorage from './storage/BinaryStorage';
import { DatabaseConfig, DatabaseDocument, DatabaseSchema, FindOptions, IDatabaseStorage } from './interfaces';
import AsyncWriteWorker from './persistence/AsyncWriteWorker';

class LmcsDB {
  private storage: IDatabaseStorage;
  private schema: DatabaseSchema = { collections: {} };
  private encryptionService?: EncryptionService;
  private config: DatabaseConfig;
  private writeWorker?: AsyncWriteWorker;
  // collection -> field -> value -> Set<id>
  private runtimeIndices: Record<string, Record<string, Map<any, Set<string>>>> = {};

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
      default:
        throw new Error('Invalid storage type');
    }

    // Configurar criptografia se a chave for fornecida
    if (config.encryptionKey) {
      this.encryptionService = new EncryptionService(config.encryptionKey);
    }
    this.writeWorker = new AsyncWriteWorker(async () => {
      let rawData = JSON.stringify(this.schema);
      if (this.encryptionService) {
        rawData = this.encryptionService.encrypt(rawData);
      }
      await this.storage.save(rawData);
    });
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

    // Decriptografar dados se necessário
    if (this.encryptionService && rawData && rawData.trim() !== '' && rawData !== '{}') {
      try {
        rawData = this.encryptionService.decrypt(rawData);
      } catch (error) {
        console.error('Decryption failed. Starting with empty database.', error);
        rawData = '{}';
      }
    }

    // Parse dos dados
    try {
      this.schema = JSON.parse(rawData || '{}');
      if (!this.schema.collections) {
        this.schema.collections = {};
      }
    } catch (error) {
      console.error('Failed to parse database. Starting with empty database.', error);
      this.schema = { collections: {} };
    }

    this.rebuildIndices();
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
    await this.save();
    if (this.writeWorker) {
      await this.writeWorker.flush();
    }
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

        const id = uuidv4();
        const newDoc = { _id: id, ...document } as T;

        this.schema.collections[name].documents[id] = newDoc;
        this.addToIndex(name, newDoc);
        this.save().catch(() => {});
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
        this.save().catch(() => {});
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

        this.save().catch(() => {});
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
}

export default LmcsDB;
