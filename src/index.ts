// Core
export { LmcsDB, DatabaseConfig } from './core/database';
export { SecureCollection, QueryOptions } from './core/collection';
export { TransactionContext } from './core/transaction-context';
export { Transaction, TransactionManager } from './core/transaction';
export { IndexManager, IndexDefinition } from './core/indexer';

// Storage (todos os tipos)
export {
  StorageFactory,
  BaseStorage,
  StorageConfig,
  StorageType,
  AOLStorage,
  JSONStorage,
  MemoryStorage,
  BinaryStorage,
  LogEntry
} from './storage';

// Crypto
export { CryptoVault, EncryptedPayload } from './crypto/vault';

// Errors
export { 
  LMCSError, 
  ValidationError, 
  CorruptionError, 
  ConcurrencyError,
  TransactionError 
} from './utils/errors';

export { FileLocker } from './utils/lock';