import { appendFile, readFile, writeFile, rename, open, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { FileLocker } from '../utils/lock';
import { CryptoVault } from '../crypto/vault';
import { CorruptionError } from '../utils/errors';
import { createHash } from 'crypto';
import { IStorage, LogEntry } from './base';

export { LogEntry };

export interface AOLConfig {
  encryptionKey?: string;
  compactionInterval?: number;
  enableChecksums?: boolean;
}

export class AOLStorage implements IStorage {
  private filePath: string;
  private vault?: CryptoVault;
  private writeBuffer: LogEntry[] = [];
  private readonly BUFFER_SIZE = 100;
  private compactionTimer?: NodeJS.Timeout;
  private locker = new FileLocker();
  private config: Required<AOLConfig>;

  constructor(
    private dbPath: string, 
    private dbName: string,
    config: AOLConfig
  ) {
    this.filePath = join(dbPath, `${dbName}.aol`);
    this.config = {
      encryptionKey: config.encryptionKey ?? '',
      compactionInterval: config.compactionInterval ?? 60000,
      enableChecksums: config.enableChecksums ?? true
    };
    
    if (config.encryptionKey) {
      this.vault = new CryptoVault(config.encryptionKey);
    }
    
    if (this.config.compactionInterval > 0) {
      this.startAutoCompaction();
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }

  async append(entry: LogEntry): Promise<void> {
    if (this.config.enableChecksums) {
      entry.checksum = this.calculateChecksum({ ...entry, checksum: '' });
    }

    this.writeBuffer.push(entry);
    
    if (this.writeBuffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;
    await this.ensureDir();

    const lines = this.writeBuffer.map(entry => {
      const line = JSON.stringify(entry);
      return this.vault ? JSON.stringify(this.vault.encrypt(line)) : line;
    });

    await this.locker.withLock(this.filePath, async () => {
      await appendFile(this.filePath, lines.join('\n') + '\n', 'utf8');
      
      const fd = await open(this.filePath, 'a');
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
    });
    
    this.writeBuffer = [];
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    await this.flush();
    
    const content = await readFile(this.filePath, 'utf8').catch(() => '');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const decrypted = this.vault 
          ? this.vault.decrypt(JSON.parse(line)) 
          : line;
        
        const entry: LogEntry = JSON.parse(decrypted);
        
        if (this.config.enableChecksums && entry.op !== 'BEGIN' && entry.op !== 'COMMIT' && entry.op !== 'ROLLBACK') {
          const expected = entry.checksum;
          const entryToCheck = { ...entry };
          delete (entryToCheck as any).checksum;
          
          if (this.calculateChecksum(entryToCheck) !== expected) {
            throw new CorruptionError(`Checksum failed for entry ${entry.id} in collection ${entry.collection}`);
          }
        }
        
        yield entry;
      } catch (err) {
        if (err instanceof CorruptionError) throw err;
        if (err instanceof Error && err.message.includes('Decryption failed')) throw err;
        console.warn('Skipping corrupted entry:', err);
      }
    }
  }

  private calculateChecksum(entry: Omit<LogEntry, 'checksum'>): string {
    return createHash('sha256')
      .update(JSON.stringify(entry))
      .digest('hex');
  }

  async compact(): Promise<void> {
    await this.flush();
    const tempFile = `${this.filePath}.tmp`;
    const state = new Map<string, LogEntry>();
    
    for await (const entry of this.readStream()) {
      if (entry.op === 'BEGIN' || entry.op === 'COMMIT' || entry.op === 'ROLLBACK') continue;
      
      const key = `${entry.collection}:${entry.id}`;
      if (entry.op === 'DELETE') {
        state.delete(key);
      } else {
        state.set(key, entry);
      }
    }

    const entries = Array.from(state.values());
    if (entries.length === 0) {
      await writeFile(this.filePath, '', 'utf8');
      return;
    }

    const lines = entries.map(e => {
      const line = JSON.stringify(e);
      return this.vault ? JSON.stringify(this.vault.encrypt(line)) : line;
    });
      
    await writeFile(tempFile, lines.join('\n'), 'utf8');
    
    await this.locker.withLock(this.filePath, async () => {
      await rename(tempFile, this.filePath);
    });
  }

  private startAutoCompaction(): void {
    this.compactionTimer = setInterval(() => {
      this.compact().catch(err => console.error('Auto-compaction failed:', err));
    }, this.config.compactionInterval);
  }

  close(): void {
    if (this.compactionTimer) {
      clearInterval(this.compactionTimer);
      this.compactionTimer = undefined;
    }
  }
}
