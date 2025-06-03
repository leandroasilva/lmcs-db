import { v4 as uuidv4 } from 'uuid';
import EncryptionService from './EncryptionService';
import InMemoryStorage from './storage/InMemoryStorage';
import JsonStorage from './storage/JsonStorage';
import BinaryStorage from './storage/BinaryStorage';
import { DatabaseConfig, DatabaseDocument, DatabaseSchema, FindOptions, IDatabaseStorage } from './interfaces';

class LmcsDB {
  private storage: IDatabaseStorage;
  private schema: DatabaseSchema = { collections: {} };
  private encryptionService?: EncryptionService;
  private config: DatabaseConfig;

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
    } catch (error) {
      console.error('Failed to parse database. Starting with empty database.', error);
      this.schema = { collections: {} };
    }
  }

  async save(): Promise<void> {
    let rawData = JSON.stringify(this.schema);

    // Criptografar dados se necessário
    if (this.encryptionService) {
      rawData = this.encryptionService.encrypt(rawData);
    }

    // Salvar dados
    await this.storage.save(rawData);
  }

  collection<T extends DatabaseDocument>(name: string) {
    return {
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
        await this.save();
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

        let documents = Object.values(collection.documents) as T[];

        // Aplicar filtro
        if (options?.filter) {
          documents = documents.filter(doc => {
            return Object.entries(options.filter!).every(([key, value]) => {

              // Suporte a operadores básicos
              if (typeof value === 'object') {
                const operators = value as Record<string, any>;

                if (operators.$eq !== undefined && doc[key as keyof T] !== operators.$eq) return false;
                if (operators.$ne !== undefined && doc[key as keyof T] === operators.$ne) return false;
                if (operators.$gt !== undefined && doc[key as keyof T] <= operators.$gt) return false;
                if (operators.$lt !== undefined && doc[key as keyof T] >= operators.$lt) return false;
                if (operators.$in !== undefined && !operators.$in.includes(doc[key as keyof T])) return false;
                if (operators.$nin !== undefined && operators.$nin.includes(doc[key as keyof T])) return false;
                if (operators.$contains !== undefined && !doc[key as keyof T].includes(operators.$contains)) return false;
                if (operators.$regex !== undefined && !new RegExp(operators.$regex).test(doc[key as keyof T])) return false;
                if (operators.$exists !== undefined && doc[key as keyof T] === undefined) return false;
                if (operators.$startsWith !== undefined && !doc[key as keyof T].startsWith(operators.$startsWith)) return false;
                if (operators.$endsWith !== undefined && !doc[key as keyof T].endsWith(operators.$endsWith)) return false;
                if (operators.$between !== undefined && (doc[key as keyof T] < operators.$between[0] || doc[key as keyof T] > operators.$between[1])) return false;

                return true;
              }

              return doc[key as keyof T] === value;
            });
          });
        }

        // Aplicar ordenação
        if (options?.sort) {
          const [sortKey, sortDirection] = Object.entries(options.sort)[0];
          documents.sort((a, b) => {
            const aValue = a[sortKey as keyof T];
            const bValue = b[sortKey as keyof T];

            if (aValue < bValue) return sortDirection === 1 ? -1 : 1;
            if (aValue > bValue) return sortDirection === 1 ? 1 : -1;
            return 0;
          });
        }

        // Aplicar limite
        if (options?.limit) {
          documents = documents.slice(0, options.limit);
        }

        return documents;
      },

      update: async (id: string, update: Partial<T>): Promise<T | null> => {
        const collection = this.schema.collections[name];
        if (!collection || !collection.documents[id]) return null;

        const updatedDoc = {
          ...collection.documents[id],
          ...update,
          _id: id // Garantir que o ID não seja alterado
        } as T;

        collection.documents[id] = updatedDoc;
        await this.save();
        return updatedDoc;
      },

      delete: async (id: string): Promise<boolean> => {
        const collection = this.schema.collections[name];
        if (!collection || !collection.documents[id]) return false;

        delete collection.documents[id];

        // Se a coleção ficar vazia, remova-a
        if (Object.keys(collection.documents).length === 0) {
          delete this.schema.collections[name];
        }

        await this.save();
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