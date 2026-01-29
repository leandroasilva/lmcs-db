import { BaseStorage } from './base';
import { LogEntry } from './aol';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { dirname } from 'path';
import { FileLocker } from '../utils/lock';
import { CryptoVault } from '../crypto/vault';

export class JSONStorage extends BaseStorage {
  private data: LogEntry[] = [];
  private locker = new FileLocker();
  private vault?: CryptoVault;
  private dirty = false;
  private autosaveInterval?: NodeJS.Timeout;
  private filePath: string;
  private lockPath: string;

  constructor(config: StorageConfig, private autosaveMs: number = 5000) {
    super(config);
    this.filePath = this.getFilePath('json');
    this.lockPath = `${config.dbPath}/${config.dbName}.json.lock`;
    
    if (config.encryptionKey) {
      this.vault = new CryptoVault(config.encryptionKey);
    }
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    
    try {
      await access(this.filePath);
      const content = await readFile(this.filePath, 'utf8');
      
      if (content.trim()) {
        const decrypted = this.vault 
          ? this.vault.decrypt(JSON.parse(content))
          : content;
        this.data = JSON.parse(decrypted);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      // Arquivo não existe, começa vazio
    }

    // Autosave periódico
    this.autosaveInterval = setInterval(() => {
      if (this.dirty) this.flush().catch(console.error);
    }, this.autosaveMs);
  }

  async append(entry: LogEntry): Promise<void> {
    this.data.push(entry);
    this.dirty = true;
    
    // Flush imediato se não houver autosave ou se for operação crítica
    if (!this.autosaveInterval) {
      await this.flush();
    }
  }

  async readAll(): Promise<LogEntry[]> {
    return [...this.data];
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    for (const entry of this.data) {
      yield entry;
    }
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    
    await this.locker.withLock(this.lockPath, async () => {
      const content = JSON.stringify(this.data, null, 2);
      const toWrite = this.vault 
        ? JSON.stringify(this.vault.encrypt(content))
        : content;
      
      await writeFile(this.filePath, toWrite, 'utf8');
      this.dirty = false;
    });
  }

  async close(): Promise<void> {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }
    await this.flush();
    this.data = [];
  }
}