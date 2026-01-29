import { join, dirname } from 'path';
import { mkdir, access, writeFile } from 'fs/promises';
import { BaseStorage, MemoryStorage, JSONStorage, AOLStorage, BinaryStorage, StorageConfig } from '../storage';
import { Collection } from './collection';
import { TransactionManager } from './transaction';
import { TransactionContext } from './transaction-context';
import { FileLocker } from '../utils/lock';

export type StorageType = 'memory' | 'json' | 'aol' | 'binary';

export interface DatabaseOptions {
  storageType: StorageType;
  databaseName: string;
  encryptionKey?: string;
  customPath?: string;
  compactionInterval?: number; // para AOL
  bufferSize?: number;         // para AOL
  autosaveInterval?: number;   // para JSON
  enableChecksums?: boolean;
}

export class Database {
  private storage: BaseStorage;
  private collections = new Map<string, Collection<any>>();
  private locker: FileLocker;
  private lockPath: string;
  private initialized = false;
  private txManager?: TransactionManager;
  private txLock: Promise<void> = Promise.resolve();

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
          compactionInterval: options.compactionInterval,
          bufferSize: options.bufferSize
        });
        break;
      case 'binary':
        this.storage = new BinaryStorage(config);
        break;
      default:
        throw new Error(`Unknown storage type: ${options.storageType}`);
    }

    this.lockPath = join(basePath, `${options.databaseName}.lock`);
    this.locker = new FileLocker();
    
    // Enable transactions by default or if configured
    this.txManager = new TransactionManager(this.storage);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const lockDir = dirname(this.lockPath);
    await mkdir(lockDir, { recursive: true });
    
    try {
      await access(this.lockPath);
    } catch {
      await writeFile(this.lockPath, '', 'utf8');
    }
    
    await this.locker.acquire(this.lockPath);
    await this.storage.initialize();
    
    if (this.txManager) {
      await this.txManager.recover();
    }
    
    this.initialized = true;
  }

  collection<T extends Record<string, any>>(name: string): Collection<T> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection<T>(name, this.storage));
    }
    return this.collections.get(name)!;
  }

  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    // Acquire lock for transaction serialization
    let releaseLock: () => void;
    const acquire = new Promise<void>(resolve => releaseLock = resolve);
    const currentLock = this.txLock;
    this.txLock = this.txLock.then(() => acquire);
    await currentLock;

    try {
      if (!this.txManager) {
        throw new Error('Transactions not enabled');
      }
      
      const txId = await this.txManager.begin();
      const context = new TransactionContext(
        txId, 
        this.txManager, 
        this.storage,
        async (col, id) => {
          return this.collection(col).findOne({ _id: id });
        }
      );
      
      try {
        const result = await fn(context);
        const ops = await this.txManager.commit(txId);
        
        // Update in-memory state
        for (const op of ops) {
          const collection = this.collections.get(op.collection);
          if (collection) {
            let logOp: 'INSERT' | 'UPDATE' | 'DELETE';
            switch (op.type) {
              case 'insert': logOp = 'INSERT'; break;
              case 'update': logOp = 'UPDATE'; break;
              case 'delete': logOp = 'DELETE'; break;
              default: continue;
            }

            collection.applyLogEntry({
              op: logOp,
              collection: op.collection,
              id: op.id,
              data: op.newData,
              checksum: '',
              timestamp: Date.now(),
              txId
            });
          }
        }
        
        return result;
      } catch (error) {
        await this.txManager.rollback(txId);
        throw error;
      }
    } finally {
      releaseLock!();
    }
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