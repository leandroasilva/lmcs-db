import fs from 'fs';
import path from 'path';
import { IDatabaseStorage } from '../interfaces';

class BinaryStorage implements IDatabaseStorage {
  private filePath: string;

  constructor(databaseName: string, customPath?: string) {
    const basePath = customPath ?? process.cwd();
    this.filePath = path.resolve(basePath, `${databaseName}.db`);
  }

  async save(data: string): Promise<void> {
    const buffer = Buffer.from(data, 'utf-8');
    await fs.promises.writeFile(this.filePath, buffer);
  }

  async load(): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(this.filePath);
      return buffer.toString('utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '{}';
      }
      throw error;
    }
  }
}

export default BinaryStorage;