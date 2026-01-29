import { BaseStorage, StorageConfig } from './base';
import { AOLStorage } from './aol';
import { JSONStorage } from './json';
import { MemoryStorage } from './memory';
import { BinaryStorage } from './binary';

export type StorageType = 'aol' | 'json' | 'memory' | 'binary';

export interface StorageFactoryConfig extends StorageConfig {
  type: StorageType;
  compactionInterval?: number;
  enableChecksums?: boolean;
  autosaveInterval?: number;
}

export class StorageFactory {
  static create(config: StorageFactoryConfig): BaseStorage {
    switch (config.type) {
      case 'aol':
        return new AOLStorage(
          config.dbPath, 
          config.dbName, 
          {
            encryptionKey: config.encryptionKey,
            compactionInterval: config.compactionInterval,
            enableChecksums: config.enableChecksums
          }
        );
      
      case 'json':
        return new JSONStorage(
          {
            dbPath: config.dbPath,
            dbName: config.dbName,
            encryptionKey: config.encryptionKey
          },
          config.autosaveInterval
        );
      
      case 'memory':
        return new MemoryStorage({
          dbPath: config.dbPath,
          dbName: config.dbName
        });
      
      case 'binary':
        return new BinaryStorage({
          dbPath: config.dbPath,
          dbName: config.dbName,
          encryptionKey: config.encryptionKey
        });
      
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }
}

export { BaseStorage, StorageConfig };
export { AOLStorage, LogEntry, AOLConfig } from './aol';
export { JSONStorage } from './json';
export { MemoryStorage } from './memory';
export { BinaryStorage } from './binary';