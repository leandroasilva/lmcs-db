export interface LogEntry {
  op: 'INSERT' | 'UPDATE' | 'DELETE' | 'BEGIN' | 'COMMIT' | 'ROLLBACK';
  collection: string;
  id: string;
  data?: unknown;
  checksum: string;
  timestamp: number;
  txId?: string;
}

export interface StorageConfig {
  dbPath: string;
  dbName: string;
  encryptionKey?: string;
  enableChecksums?: boolean;
}

export abstract class BaseStorage {
  protected config: StorageConfig;
  
  constructor(config: StorageConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract append(entry: LogEntry): Promise<void>;
  abstract readStream(): AsyncGenerator<LogEntry>;
  abstract flush(): Promise<void>;
  abstract close(): Promise<void>;
  abstract clear?(): Promise<void>;
  abstract compact?(): Promise<void>;
  
  protected getFilePath(extension: string): string {
    return `${this.config.dbPath}/${this.config.dbName}.${extension}`;
  }
}