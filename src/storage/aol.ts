import { BaseStorage, LogEntry, StorageConfig } from "./base";
import { CryptoManager } from "../crypto/manager";
import {
  appendFile,
  readFile,
  writeFile,
  rename,
  open,
  mkdir,
} from "fs/promises";
import { dirname } from "path";
import { FileLocker } from "../utils/lock";
import { createHash } from "crypto";

export class AOLStorage extends BaseStorage {
  private buffer: LogEntry[] = [];
  private crypto?: CryptoManager;
  private locker = new FileLocker();
  private bufferSize = 100;
  private compactionTimer?: NodeJS.Timeout;
  private isInitialized = false;
  private writeCount = 0;

  constructor(
    config: StorageConfig & {
      compactionInterval?: number;
      bufferSize?: number;
    },
  ) {
    super(config);
    if (config.encryptionKey) {
      this.crypto = new CryptoManager(config.encryptionKey);
    }
    this.bufferSize = config.bufferSize || 100;

    if (config.compactionInterval && config.compactionInterval > 0) {
      this.compactionTimer = setInterval(() => {
        this.compact().catch(console.error);
      }, config.compactionInterval);
    }
  }

  async initialize(): Promise<void> {
    const filePath = this.getFilePath("aol");
    await mkdir(dirname(filePath), { recursive: true });
    this.isInitialized = true;
  }

  async append(entry: LogEntry): Promise<void> {
    if (!this.isInitialized) throw new Error("Storage not initialized");

    if (this.config.enableChecksums) {
      const entryForChecksum = { ...entry };
      delete (entryForChecksum as any).checksum;

      entry.checksum = createHash("sha256")
        .update(JSON.stringify(entryForChecksum))
        .digest("hex");
    }

    this.buffer.push(entry);
    this.writeCount++;

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.isInitialized) return;

    const filePath = this.getFilePath("aol");
    const lockPath = `${filePath}.lock`;

    await this.locker.withLock(lockPath, async () => {
      const lines = this.buffer.map((entry) => {
        const line = JSON.stringify(entry);
        if (this.crypto) {
          return JSON.stringify(this.crypto.encrypt(line));
        }
        return line;
      });

      await appendFile(filePath, lines.join("\n") + "\n", "utf8");

      // fsync para durabilidade
      const fd = await open(filePath, "a");
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
    });

    this.buffer = [];
  }

  async *readStream(): AsyncGenerator<LogEntry> {
    await this.flush();

    const filePath = this.getFilePath("aol");

    try {
      const content = await readFile(filePath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          let jsonStr: string;

          if (this.crypto) {
            const encrypted = JSON.parse(line);
            jsonStr = this.crypto.decrypt(encrypted);
          } else {
            jsonStr = line;
          }

          const entry: LogEntry = JSON.parse(jsonStr);

          // Verifica checksum
          if (this.config.enableChecksums && entry.checksum) {
            const expected = entry.checksum;
            const checkEntry = { ...entry };
            delete (checkEntry as any).checksum;
            const actual = createHash("sha256")
              .update(JSON.stringify(checkEntry))
              .digest("hex");

            if (actual !== expected) {
              console.warn(`Checksum mismatch for entry ${entry.id}, skipping`);
              continue;
            }
          }

          yield entry;
        } catch (err) {
          console.warn("Corrupted log entry skipped:", err);
        }
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async compact(): Promise<void> {
    await this.flush();

    const filePath = this.getFilePath("aol");
    const tempFile = `${filePath}.tmp`;

    const state = new Map<string, LogEntry>();

    for await (const entry of this.readStream()) {
      const key = `${entry.collection}:${entry.id}`;

      if (entry.op === "DELETE") {
        state.delete(key);
      } else if (
        entry.op !== "BEGIN" &&
        entry.op !== "COMMIT" &&
        entry.op !== "ROLLBACK"
      ) {
        state.set(key, entry);
      }
    }

    const entries = Array.from(state.values());

    if (entries.length === 0) {
      await writeFile(filePath, "", "utf8");
      return;
    }

    const lines = entries.map((e) => {
      const line = JSON.stringify(e);
      return this.crypto ? JSON.stringify(this.crypto.encrypt(line)) : line;
    });

    await writeFile(tempFile, lines.join("\n"), "utf8");

    const lockPath = `${filePath}.lock`;
    await this.locker.withLock(lockPath, async () => {
      await rename(tempFile, filePath);
    });

    console.log(
      `Compaction complete: ${this.writeCount} writes -> ${entries.length} entries`,
    );
  }

  async close(): Promise<void> {
    await this.flush();
    if (this.compactionTimer) clearInterval(this.compactionTimer);
    this.isInitialized = false;
  }

  getStats() {
    return {
      buffered: this.buffer.length,
      totalWrites: this.writeCount,
    };
  }

  clear?(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export { LogEntry };

