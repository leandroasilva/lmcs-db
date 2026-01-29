import { join } from 'path';
import { StorageFactory, StorageType, BaseStorage } from '../storage';
import { TransactionManager } from './transaction';
import { TransactionContext } from './transaction-context';
import { IndexManager } from './indexer';
import { FileLocker } from '../utils/lock';
import { SecureCollection } from './collection';
import { ValidationError } from '../utils/errors';

export interface DatabaseConfig {
  storageType: StorageType;
  databaseName: string;
  encryptionKey?: string;
  customPath?: string;
  enableTransactions?: boolean;
  compactionInterval?: number;
  enableChecksums?: boolean;
  autosaveInterval?: number; // Para JSON
}

export class LmcsDB {
  private storage!: BaseStorage;
  private txManager?: TransactionManager;
  private indexer = new IndexManager();
  private locker = new FileLocker();
  private initialized = false;
  private collections = new Map<string, SecureCollection<any>>();
  private config: DatabaseConfig;
  private lockPath: string;

  constructor(config: DatabaseConfig) {
    if (config.encryptionKey !== undefined) {
      if (typeof config.encryptionKey !== 'string' || config.encryptionKey.length === 0) {
        throw new ValidationError('encryptionKey must be a non-empty string when provided');
      }
    }

    this.config = {
      enableTransactions: true,
      compactionInterval: 60000,
      enableChecksums: true,
      autosaveInterval: 5000,
      ...config
    };

    const basePath = this.config.customPath || './lmcs-data';
    this.lockPath = join(basePath, `${config.databaseName}.lock`);

    // Usa Factory para criar o storage correto
    this.storage = StorageFactory.create({
      type: config.storageType,
      dbPath: basePath,
      dbName: config.databaseName,
      encryptionKey: config.encryptionKey,
      compactionInterval: this.config.compactionInterval,
      enableChecksums: this.config.enableChecksums,
      autosaveInterval: this.config.autosaveInterval
    });

    if (this.config.enableTransactions && config.storageType !== 'memory') {
      this.txManager = new TransactionManager(this.storage as any);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.locker.acquire(this.lockPath, { retries: 10 });
    
    try {
      await this.storage.initialize();
      
      if (this.txManager) {
        await this.txManager.recover();
      }

      for await (const entry of this.storage.readStream()) {
        if (entry.collection.startsWith('_')) continue;
        
        let col = this.collections.get(entry.collection);
        if (!col) {
          col = new SecureCollection(
            entry.collection, 
            this.storage as any, 
            this.indexer, 
            this.txManager
          );
          this.collections.set(entry.collection, col);
        }
        col.loadFromLog(entry);
      }
      
      this.initialized = true;
    } catch (error) {
      await this.locker.release(this.lockPath);
      throw error;
    }
  }

  collection<T extends Record<string, any>>(name: string): SecureCollection<T> {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    
    if (!this.collections.has(name)) {
      const col = new SecureCollection<T>(
        name, 
        this.storage as any, 
        this.indexer, 
        this.txManager
      );
      this.collections.set(name, col);
    }
    
    return this.collections.get(name)!;
  }

  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.txManager) {
      throw new Error('Transactions not available for this storage type');
    }
    
    const txId = await this.txManager.begin();
    const context = new TransactionContext(txId, this.txManager, this.storage as any);
    
    try {
      const result = await fn(context);
      await this.txManager.commit(txId);
      return result;
    } catch (error) {
      await this.txManager.rollback(txId);
      throw error;
    }
  }

  async compact(): Promise<void> {
    if (this.storage.compact) {
      await this.storage.compact();
    }
  }

  async close(): Promise<void> {
    await this.storage.flush();
    await this.storage.close();
    await this.locker.release(this.lockPath);
  }

  stats(): { collections: number; documents: number } {
    let docs = 0;
    for (const col of this.collections.values()) {
      docs += col.count();
    }
    return {
      collections: this.collections.size,
      documents: docs
    };
  }

  get storageType(): StorageType {
    return this.config.storageType;
  }
}