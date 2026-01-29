import { join } from 'path';
import { BaseStorage, MemoryStorage, JSONStorage, AOLStorage, StorageConfig } from '../storage';
import { Collection } from './collection';
import { FileLocker } from '../utils/lock';

export type StorageType = 'memory' | 'json' | 'aol';

export interface DatabaseOptions {
  storageType: StorageType;
  databaseName: string;
  encryptionKey?: string;
  customPath?: string;
  compactionInterval?: number; // para AOL
  autosaveInterval?: number;   // para JSON
  enableChecksums?: boolean;
}

export class Database {
  private storage: BaseStorage;
  private collections = new Map<string, Collection<any>>();
  private locker: FileLocker;
  private lockPath: string;
  private initialized = false;

  constructor(private options: DatabaseOptions) {
    const basePath = options.customPath || './data';
    const config: StorageConfig = {
      dbPath: basePath,
      dbName: options.databaseName,
      encryptionKey: options.encryptionKey,
      enableChecksums: options.enableChecksums ?? false
    };

    // Factory switch
    switch (options.storageType) {
      case 'memory':
        this.storage = new MemoryStorage(config);
        break;
      case 'json':
        this.storage = new JSONStorage(config, options.autosaveInterval);
        break;
      case 'aol':
        this.storage = new AOLStorage({
          ...config,
          compactionInterval: options.compactionInterval
        });
        break;
      default:
        throw new Error(`Unknown storage type: ${options.storageType}`);
    }

    this.lockPath = join(basePath, `${options.databaseName}.lock`);
    this.locker = new FileLocker();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.locker.acquire(this.lockPath);
    await this.storage.initialize();
    this.initialized = true;
  }

  collection<T extends Record<string, any>>(name: string): Collection<T> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection<T>(name, this.storage));
    }
    return this.collections.get(name)!;
  }

  async save(): Promise<void> {
    await this.storage.flush();
  }

  async compact(): Promise<void> {
    if (this.storage.compact) {
      await this.storage.compact();
    }
  }

  async close(): Promise<void> {
    await this.storage.close();
    await this.locker.release(this.lockPath);
    this.initialized = false;
  }

  get stats() {
    return {
      collections: this.collections.size,
      storage: this.options.storageType
    };
  }
}

// Factory function para conveniência
export async function createDatabase(options: DatabaseOptions): Promise<Database> {
  const db = new Database(options);
  await db.initialize();
  return db;
}