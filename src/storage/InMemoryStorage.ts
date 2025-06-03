import { IDatabaseStorage } from "../interfaces";

class InMemoryStorage implements IDatabaseStorage {
  private data: string = '';

  async save(data: string): Promise<void> {
    this.data = data;
  }

  async load(): Promise<string> {
    return this.data;
  }
}

export default InMemoryStorage;