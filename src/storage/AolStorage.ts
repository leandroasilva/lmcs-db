import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { IDatabaseStorage, LogEntry, DatabaseSchema } from '../interfaces';

class AolStorage implements IDatabaseStorage {
  private filePath: string;
  private writeStream?: fs.WriteStream;

  constructor(databaseName: string, customPath?: string) {
    const basePath = customPath ?? process.cwd();
    this.filePath = path.resolve(basePath, `${databaseName}.aol`);
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async save(data: string): Promise<void> {
    // Save here acts as a "Compact/Snapshot" operation
    // It overwrites the log with a single snapshot of the current state
    // Ideally, this should be an atomic replace
    this.ensureDirectory();
    
    // We'll write a special snapshot entry or just the full JSON?
    // For simplicity and compatibility, if save() is called with the full JSON state,
    // we should probably reset the log to be just this state (as a snapshot).
    // But since AolStorage is line-based, let's write it as a series of inserts 
    // OR just write the full state as a special 'snapshot' line?
    // 
    // Actually, the simplest way to compact is:
    // 1. Write the full JSON to a temp file
    // 2. Rename temp file to .aol file (atomic replace)
    // 
    // However, then we lose the "Log" format if we just dump JSON.
    // If we want to maintain pure AOL, we should iterate the data and write 'i' ops.
    // But LmcsDB calls save(JSON.stringify(schema)).
    // So we need to parse it back if we want to write ops, OR we just change the file format
    // to allow a "SNAPSHOT" line.
    
    // Strategy: The .aol file will contain NDJSON lines.
    // If we receive a full save(), we can just write one line:
    // { "op": "snapshot", "data": ... }
    // Or we can just overwrite the file with the provided JSON (which is a valid snapshot).
    // And subsequent appends will just append to it.
    // But standard JSON is not stream-friendly if it's a big object.
    
    // Better strategy for this implementation:
    // save() REPLACES the file with the current full state (compacted).
    // Future appends will go to the end of this file.
    // But wait, if the file starts with a JSON object { "collections": ... }, 
    // we can't just append JSON lines after it and expect `JSON.parse` to work.
    // We need a robust `load` that can handle:
    // 1. A base snapshot (maybe standard JSON)
    // 2. Followed by log lines
    
    // Let's implement `load` to handle this hybrid approach.
    
    await fs.promises.writeFile(this.filePath, data + '\n', 'utf-8');
    
    // Re-open stream
    if (this.writeStream) {
      this.writeStream.end();
    }
    this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });
  }

  async append(entry: LogEntry): Promise<void> {
    this.ensureDirectory();
    
    if (!this.writeStream) {
      this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });
    }

    const line = JSON.stringify(entry) + '\n';
    
    const canWrite = this.writeStream.write(line);
    
    if (!canWrite) {
        // Only wait for drain if buffer is full
        // Use once with a cleanup to avoid listener leak if needed, 
        // but 'once' handles auto-removal. 
        // The warning happens because we add many 'once' listeners in parallel loop.
        // We should just return a promise that resolves on drain ONLY if needed.
        // But if many calls pile up, they all attach listeners.
        // 
        // Ideally, we shouldn't await every single write if we want speed.
        // But to guarantee durability, we might want to.
        // 
        // To fix the warning: either increase max listeners or serialize writes.
        // Since we are inside an async function called in parallel (in the benchmark loop),
        // we are attaching 5000 listeners.
        // 
        // Best approach: If buffer is full, wait. If not, return immediately.
        // And maybe handle the listeners better.
        
        return new Promise((resolve) => {
            this.writeStream!.once('drain', resolve);
        });
    }
    
    return Promise.resolve();
  }

  async load(): Promise<string> {
    try {
      // Check if file exists
      try {
        await fs.promises.access(this.filePath);
      } catch {
        return '{}';
      }

      const fileStream = fs.createReadStream(this.filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      const schema: DatabaseSchema = { collections: {} };
      let isFirstLine = true;

      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          // If the first line looks like a full schema (has 'collections'), use it as base
          if (isFirstLine && data.collections) {
            schema.collections = data.collections;
            isFirstLine = false;
            continue;
          }
          isFirstLine = false;

          // Process LogEntry
          if (data.op && data.col && data.id) {
            const { op, col, id, doc } = data as LogEntry;

            if (!schema.collections[col]) {
              schema.collections[col] = { name: col, documents: {} };
            }

            switch (op) {
              case 'i':
              case 'u':
                if (doc) {
                    schema.collections[col].documents[id] = doc;
                }
                break;
              case 'd':
                if (schema.collections[col].documents[id]) {
                  delete schema.collections[col].documents[id];
                }
                break;
            }
          }
        } catch (e) {
          console.warn('Skipping corrupted line in AOL storage:', e);
        }
      }

      return JSON.stringify(schema);
    } catch (error) {
       if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '{}';
      }
      throw error;
    }
  }
}

export default AolStorage;
