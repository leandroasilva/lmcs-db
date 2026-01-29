import { LogEntry } from './aol';

export interface StorageConfig {
  dbPath: string;
  dbName: string;
  encryptionKey?: string;
}

export interface FindOptions {
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export abstract class BaseStorage {
  protected config: StorageConfig;
  
  constructor(config: StorageConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract append(entry: LogEntry): Promise<void>;
  abstract readAll(): Promise<LogEntry[]>;
  abstract *readStream(): AsyncGenerator<LogEntry>;
  abstract flush(): Promise<void>;
  abstract close(): Promise<void>;
  abstract compact?(): Promise<void>;
  
  // Utilitários comuns
  protected getFilePath(extension: string): string {
    return `${this.config.dbPath}/${this.config.dbName}.${extension}`;
  }
}