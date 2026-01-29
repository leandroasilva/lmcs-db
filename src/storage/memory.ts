import { IStorage, LogEntry } from './base';

export class MemoryStorage implements IStorage {
  private logs: LogEntry[] = [];

  async append(entry: LogEntry): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(entry));
    this.logs.push(cloned);
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    for (const entry of this.logs) {
      yield entry;
    }
  }

  async flush(): Promise<void> {}

  async compact(): Promise<void> {
    const state = new Map<string, LogEntry>();
    
    for (const entry of this.logs) {
      if (entry.op === 'BEGIN' || entry.op === 'COMMIT' || entry.op === 'ROLLBACK') continue;
      
      const key = `${entry.collection}:${entry.id}`;
      if (entry.op === 'DELETE') {
        state.delete(key);
      } else {
        state.set(key, entry);
      }
    }

    this.logs = Array.from(state.values());
  }

  close(): void {
    this.logs = [];
  }
}
