import path from 'path';
import fs from 'fs';
import { IDatabaseStorage } from '../interfaces';

class JsonStorage implements IDatabaseStorage {
  private filePath: string;

  constructor(databaseName: string) {
    this.filePath = path.resolve(process.cwd(), `${databaseName}.db`);
  }

  async save(data: string): Promise<void> {
    await fs.promises.writeFile(this.filePath, data, 'utf-8');
  }

  async load(): Promise<string> {
    try {
      return await fs.promises.readFile(this.filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '{}';
      }
      throw error;
    }
  }
}

export default JsonStorage;