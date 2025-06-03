import fs from 'fs';
import path from 'path';
import { IDatabaseStorage } from '../interfaces';

class BinaryStorage implements IDatabaseStorage {
  private filePath: string;

  constructor(databaseName: string, customPath?: string) {
    const basePath = customPath ?? process.cwd();
    this.filePath = path.resolve(basePath, `${databaseName}.db`);
  }

  private xorBuffer(buffer: Buffer, key: number = 0xAA): Buffer {
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = buffer[i] ^ key;
    }
    return result;
  }

  async save(data: string): Promise<void> {
    const raw = Buffer.from(data, 'utf-8');
    const obfuscated = this.xorBuffer(raw);
    await fs.promises.writeFile(this.filePath, obfuscated);
  }

  async load(): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(this.filePath);
      const deobfuscated = this.xorBuffer(buffer);
      return deobfuscated.toString('utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '{}';
      }
      throw error;
    }
  }
}

export default BinaryStorage;