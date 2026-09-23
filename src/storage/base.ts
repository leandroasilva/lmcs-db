
export interface IStorage {
  initialize(): Promise<void>;
  append(entry: LogEntry): Promise<void>;
  readStream(): AsyncGenerator<LogEntry>;
  flush(): Promise<void>;
  close(): Promise<void>;
  clear?(): Promise<void>;
  compact?(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
}

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

export abstract class BaseStorage implements IStorage {
  protected config: StorageConfig;
  private errorListeners: Set<(error: Error) => void> = new Set();
  
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

  on(event: 'error', listener: (error: Error) => void): this {
    if (event === 'error') {
      this.errorListeners.add(listener);
    }
    return this;
  }

  off(event: 'error', listener: (error: Error) => void): this {
    if (event === 'error') {
      this.errorListeners.delete(listener);
    }
    return this;
  }

  protected emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Ignore listener errors
      }
    }
  }
}