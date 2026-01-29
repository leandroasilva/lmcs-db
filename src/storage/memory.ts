import { BaseStorage, LogEntry, StorageConfig } from "./base";

export class MemoryStorage extends BaseStorage {
  private logs: LogEntry[] = [];
  private isInitialized = false;

  constructor(config: StorageConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
    this.logs = [];
  }

  async append(entry: LogEntry): Promise<void> {
    if (!this.isInitialized) throw new Error("Storage not initialized");
    this.logs.push({ ...entry });
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    for (const entry of this.logs) {
      yield entry;
    }
  }

  async flush(): Promise<void> {
    // Nada a fazer em memória
  }

  async close(): Promise<void> {
    this.logs = [];
    this.isInitialized = false;
  }

  async clear(): Promise<void> {
    this.logs = [];
  }

  getSize(): number {
    return this.logs.length;
  }

  compact?(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
