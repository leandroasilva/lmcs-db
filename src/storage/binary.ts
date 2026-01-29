import { BaseStorage, LogEntry, StorageConfig } from "./base";
import { writeFile, readFile, mkdir, access } from "fs/promises";
import { dirname } from "path";
import { createHash } from "crypto";
import { FileLocker } from "../utils/lock";
import { CryptoManager } from "../crypto/manager";

interface BinaryHeader {
  magic: string;
  version: number;
  checksum: string;
  encrypted: boolean;
}

export class BinaryStorage extends BaseStorage {
  private data: LogEntry[] = [];
  private locker = new FileLocker();
  private crypto?: CryptoManager;
  private filePath: string;
  private lockPath: string;
  private readonly MAGIC = "LMCS";
  private readonly VERSION = 1;

  constructor(config: StorageConfig) {
    super(config);
    this.filePath = this.getFilePath("bin");
    this.lockPath = `${config.dbPath}/${config.dbName}.bin.lock`;

    if (config.encryptionKey) {
      this.crypto = new CryptoManager(config.encryptionKey);
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
      if (err.code !== "ENOENT") throw err;
    }
  }

  async append(entry: LogEntry): Promise<void> {
    this.data.push(entry);
    // Binary always does full rewrite (not append-only)
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

  async clear(): Promise<void> {
    this.data = [];
    await this.flush();
  }

  async compact(): Promise<void> {
    // Binary storage rewrites on every append, so it's always compact
    return Promise.resolve();
  }

  private serialize(entries: LogEntry[]): Buffer {
    const jsonStr = JSON.stringify(entries);
    const compressed = Buffer.from(jsonStr); // Placeholder for compression

    const header: BinaryHeader = {
      magic: this.MAGIC,
      version: this.VERSION,
      checksum: createHash("sha256").update(compressed).digest("hex"),
      encrypted: !!this.crypto,
    };

    let payload = compressed;
    if (this.crypto) {
      const encrypted = this.crypto.encrypt(jsonStr);
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
    try {
      let offset = 0;
      
      const headerLen = buffer.readUInt32BE(offset);
      offset += 4;

      const headerBuf = buffer.slice(offset, offset + headerLen);
      offset += headerLen;
      const header: BinaryHeader = JSON.parse(headerBuf.toString());

      if (header.magic !== this.MAGIC) throw new Error("Invalid file format");

      const payloadLen = buffer.readUInt32BE(offset);
      offset += 4;

      const payload = buffer.slice(offset, offset + payloadLen);

      let jsonStr: string;
      if (header.encrypted) {
        if (!this.crypto) throw new Error("File is encrypted but no key provided");
        const encrypted = JSON.parse(payload.toString());
        jsonStr = this.crypto.decrypt(encrypted);
      } else {
        jsonStr = payload.toString();
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("Failed to deserialize binary storage:", error);
      return [];
    }
  }
}
