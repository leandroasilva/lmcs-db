// Database
export { Database, createDatabase, DatabaseOptions, StorageType } from './core/database';
export { Collection, QueryOptions } from './core/collection';

// Storage
export { BaseStorage, StorageConfig, LogEntry } from './storage/base';
export { MemoryStorage } from './storage/memory';
export { JSONStorage } from './storage/json';
export { AOLStorage } from './storage/aol';

// Crypto
export { CryptoManager, EncryptedData } from './crypto/manager';