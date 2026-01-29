import { BaseStorage, LogEntry, StorageConfig } from "./base";
import { CryptoManager } from "../crypto/manager";
import { writeFile, readFile, mkdir, access } from "fs/promises";
import { dirname } from "path";
import { FileLocker } from "../utils/lock";

export class JSONStorage extends BaseStorage {
  private cache: LogEntry[] = [];
  private crypto?: CryptoManager;
  private locker = new FileLocker();
  private dirty = false;
  private autosaveTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(
    config: StorageConfig,
    private autosaveInterval = 5000,
  ) {
    super(config);
    if (config.encryptionKey) {
      this.crypto = new CryptoManager(config.encryptionKey);
    }
  }

  async initialize(): Promise<void> {
    const filePath = this.getFilePath("json");
    await mkdir(dirname(filePath), { recursive: true });

    try {
      await access(filePath);
      const content = await readFile(filePath, "utf8");

      if (content.trim()) {
        let jsonContent: string;

        if (this.crypto) {
          const encrypted = JSON.parse(content);
          jsonContent = this.crypto.decrypt(encrypted);
        } else {
          jsonContent = content;
        }

        this.cache = JSON.parse(jsonContent);
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        // Se falhar na descriptografia, limpa (chave errada)
        console.warn("Failed to load existing data, starting fresh");
        this.cache = [];
      }
    }

    // Autosave
    if (this.autosaveInterval > 0) {
      this.autosaveTimer = setInterval(() => {
        if (this.dirty) this.flush().catch(console.error);
      }, this.autosaveInterval);
    }

    this.isInitialized = true;
  }

  async append(entry: LogEntry): Promise<void> {
    if (!this.isInitialized) throw new Error("Storage not initialized");

    // Calcula checksum se necessário
    if (this.config.enableChecksums) {
      const { createHash } = await import("crypto");
      entry.checksum = createHash("sha256")
        .update(JSON.stringify({ ...entry, checksum: "" }))
        .digest("hex");
    }

    this.cache.push(entry);
    this.dirty = true;
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    for (const entry of this.cache) {
      yield entry;
    }
  }

  async flush(): Promise<void> {
    if (!this.dirty || !this.isInitialized) return;

    const filePath = this.getFilePath("json");
    const lockPath = `${filePath}.lock`;

    await this.locker.withLock(lockPath, async () => {
      const content = JSON.stringify(this.cache, null, 2);

      if (this.crypto) {
        const encrypted = this.crypto.encrypt(content);
        await writeFile(filePath, JSON.stringify(encrypted), "utf8");
      } else {
        await writeFile(filePath, content, "utf8");
      }

      this.dirty = false;
    });
  }

  async close(): Promise<void> {
    if (this.autosaveTimer) clearInterval(this.autosaveTimer);
    await this.flush();
    this.cache = [];
    this.isInitialized = false;
  }

  async compact(): Promise<void> {
    // Remove duplicados (mantém último estado)
    const seen = new Map<string, LogEntry>();

    for (const entry of this.cache) {
      const key = `${entry.collection}:${entry.id}`;
      if (entry.op === "DELETE") {
        seen.delete(key);
      } else {
        seen.set(key, entry);
      }
    }

    this.cache = Array.from(seen.values());
    this.dirty = true;
    await this.flush();
  }

  clear?(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
