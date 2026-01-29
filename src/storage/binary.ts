import { BaseStorage } from './base';
import { LogEntry } from './aol';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { FileLocker } from '../utils/lock';
import { CryptoVault } from '../crypto/vault';

interface BinaryHeader {
  magic: string;
  version: number;
  checksum: string;
  encrypted: boolean;
}

export class BinaryStorage extends BaseStorage {
  private data: LogEntry[] = [];
  private locker = new FileLocker();
  private vault?: CryptoVault;
  private filePath: string;
  private lockPath: string;
  private readonly MAGIC = 'LMCS';
  private readonly VERSION = 1;

  constructor(config: StorageConfig) {
    super(config);
    this.filePath = this.getFilePath('bin');
    this.lockPath = `${config.dbPath}/${config.dbName}.bin.lock`;
    
    if (config.encryptionKey) {
      this.vault = new CryptoVault(config.encryptionKey);
    }
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    
    try {
      await access(this.filePath);
      const buffer = await readFile(this.filePath);
      
      if (buffer.length > 0) {
        const payload = this.deserialize(buffer);
        this.data = payload;
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async append(entry: LogEntry): Promise<void> {
    this.data.push(entry);
    // Binary sempre faz rewrite completo (não é append-only)
    await this.flush();
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
    await this.locker.withLock(this.lockPath, async () => {
      const buffer = this.serialize(this.data);
      await writeFile(this.filePath, buffer);
    });
  }

  async close(): Promise<void> {
    await this.flush();
    this.data = [];
  }

  private serialize(entries: LogEntry[]): Buffer {
    const jsonStr = JSON.stringify(entries);
    const compressed = Buffer.from(jsonStr); // Aqui poderia usar zlib para compressão real
    
    const header: BinaryHeader = {
      magic: this.MAGIC,
      version: this.VERSION,
      checksum: createHash('crc32').update(compressed).digest('hex'),
      encrypted: !!this.vault
    };

    let payload = compressed;
    if (this.vault) {
      const encrypted = this.vault.encrypt(jsonStr);
      payload = Buffer.from(JSON.stringify(encrypted));
    }

    const headerBuf = Buffer.from(JSON.stringify(header));
    const headerLen = Buffer.alloc(4);
    headerLen.writeUInt32BE(headerBuf.length);
    
    const payloadLen = Buffer.alloc(4);
    payloadLen.writeUInt32BE(payload.length);

    return Buffer.concat([headerLen, headerBuf, payloadLen, payload]);
  }

  private deserialize(buffer: Buffer): LogEntry[] {
    let offset = 0;
    
    const headerLen = buffer.readUInt32BE(offset);
    offset += 4;
    
    const headerBuf = buffer.slice(offset, offset + headerLen);
    offset += headerLen;
    
    const header: BinaryHeader = JSON.parse(headerBuf.toString());
    
    if (header.magic !== this.MAGIC) {
      throw new Error('Invalid binary file format');
    }

    const payloadLen = buffer.readUInt32BE(offset);
    offset += 4;
    
    const payload = buffer.slice(offset, offset + payloadLen);
    
    let jsonStr: string;
    if (header.encrypted && this.vault) {
      const decrypted = this.vault.decrypt(JSON.parse(payload.toString()));
      jsonStr = decrypted;
    } else {
      jsonStr = payload.toString();
    }

    // Verifica checksum
    const computedChecksum = createHash('crc32').update(Buffer.from(jsonStr)).digest('hex');
    if (computedChecksum !== header.checksum) {
      throw new Error('Binary file corrupted (checksum mismatch)');
    }

    return JSON.parse(jsonStr);
  }
}