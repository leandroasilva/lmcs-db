import { BaseStorage, LogEntry } from "../storage";
import { CryptoManager } from "../crypto/manager";
import { v7 as uuidv7 } from 'uuid';

export interface QueryOptions {
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  batchSize?: number;
}

export class Collection<T extends Record<string, any>> {
  private data = new Map<string, T>();
  private indexes = new Map<string, Map<any, Set<string>>>();
  private crypto = new CryptoManager(); // Instância sem chave para hash apenas

  constructor(
    private name: string,
    private storage: BaseStorage, // Aceita qualquer storage
  ) {
    this.loadFromStorage().catch(console.error);
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (!this.storage.readStream) {
        throw new Error("Storage does not support streaming");
      }

      const stream = this.storage.readStream();
      for await (const entry of stream) {
        this.applyLogEntry(entry);
      }
    } catch (err) {
      console.error(`Failed to load collection ${this.name}:`, err);
    }
  }

  applyLogEntry(entry: LogEntry): void {
    if (entry.collection !== this.name) return;

    const id = entry.id;

    switch (entry.op) {
      case "INSERT":
      case "UPDATE":
        const existing = this.data.get(id);
        if (existing) {
          this.removeFromIndexes(id, existing);
        }
        this.data.set(id, entry.data as T);
        this.addToIndexes(id, entry.data as T);
        break;

      case "DELETE":
        const old = this.data.get(id);
        if (old) {
          this.removeFromIndexes(id, old);
        }
        this.data.delete(id);
        break;
    }
  }

  private addToIndexes(id: string, doc: T): void {
    for (const [field, index] of this.indexes) {
      const value = (doc as any)[field];
      if (value !== undefined) {
        if (!index.has(value)) index.set(value, new Set());
        index.get(value)!.add(id);
      }
    }
  }

  private removeFromIndexes(id: string, doc: T): void {
    for (const [field, index] of this.indexes) {
      const value = (doc as any)[field];
      if (value !== undefined) {
        index.get(value)?.delete(id);
      }
    }
  }

  async insert(doc: Omit<T, "_id"> & { _id?: string }): Promise<T> {
    const id = doc._id || uuidv7();

    if (this.data.has(id)) {
      throw new Error(`Document with id ${id} already exists`);
    }

    const fullDoc = { ...doc, _id: id } as unknown as T;

    await this.storage.append({
      op: "INSERT",
      collection: this.name,
      id,
      data: fullDoc,
      checksum: "",
      timestamp: Date.now(),
    });

    this.data.set(id, fullDoc);
    this.addToIndexes(id, fullDoc);

    return fullDoc;
  }

  async update(filter: Partial<T>, updates: Partial<T>): Promise<number> {
    let count = 0;

    for (const [id, doc] of this.data.entries()) {
      if (this.matchesFilter(doc, filter)) {
        const newDoc = { ...doc, ...updates, _id: id } as unknown as T;

        await this.storage.append({
          op: "UPDATE",
          collection: this.name,
          id,
          data: newDoc,
          checksum: "",
          timestamp: Date.now(),
        });

        this.removeFromIndexes(id, doc);
        this.data.set(id, newDoc);
        this.addToIndexes(id, newDoc);
        count++;
      }
    }

    return count;
  }

  async delete(filter: Partial<T>): Promise<number> {
    let count = 0;
    const toDelete: string[] = [];

    for (const [id, doc] of this.data.entries()) {
      if (this.matchesFilter(doc, filter)) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      const doc = this.data.get(id)!;

      await this.storage.append({
        op: "DELETE",
        collection: this.name,
        id,
        checksum: "",
        timestamp: Date.now(),
      });

      this.removeFromIndexes(id, doc);
      this.data.delete(id);
      count++;
    }

    return count;
  }

  async findOne(filter: Partial<T>): Promise<T | null> {
    // Tenta usar índice primeiro
    const indexedId = this.queryByIndex(filter);
    if (indexedId) {
      return this.data.get(indexedId) || null;
    }

    for (const doc of this.data.values()) {
      if (this.matchesFilter(doc, filter)) return doc;
    }
    return null;
  }

  async findAll(options: QueryOptions = {}): Promise<T[]> {
    let results = Array.from(this.data.values());

    if (options.filter) {
      results = results.filter((d) =>
        this.matchesFilter(d, options.filter as Partial<T>),
      );
    }

    if (options.sort) {
      results.sort((a, b) => {
        for (const [field, dir] of Object.entries(options.sort!)) {
          const aVal = (a as any)[field];
          const bVal = (b as any)[field];
          if (aVal < bVal) return dir === 1 ? -1 : 1;
          if (aVal > bVal) return dir === 1 ? 1 : -1;
        }
        return 0;
      });
    }

    if (options.skip) results = results.slice(options.skip);
    if (options.limit) results = results.slice(0, options.limit);

    return results;
  }

  async *findStream(options: QueryOptions = {}): AsyncGenerator<T> {
    if (options.sort) {
      const all = await this.findAll(options);
      for (const doc of all) yield doc;
      return;
    }

    let count = 0;
    let skipped = 0;

    for (const doc of this.data.values()) {
      if (options.filter && !this.matchesFilter(doc, options.filter as Partial<T>)) continue;

      if (options.skip && skipped < options.skip) {
        skipped++;
        continue;
      }

      if (options.limit && count >= options.limit) break;

      yield doc;
      count++;
    }
  }

  createIndex(field: keyof T): void {
    if (this.indexes.has(field as string)) return;
    this.indexes.set(field as string, new Map());

    // Indexa existentes
    for (const [id, doc] of this.data.entries()) {
      this.addToIndexes(id, doc);
    }
  }

  private matchesFilter(doc: T, filter: any): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key === "$or") {
        if (!Array.isArray(value)) return false;
        if (!value.some((condition) => this.matchesFilter(doc, condition))) return false;
        continue;
      }

      if (key === "$and") {
        if (!Array.isArray(value)) return false;
        if (!value.every((condition) => this.matchesFilter(doc, condition))) return false;
        continue;
      }

      // Handle dot notation for nested fields
      const docValue = this.getNestedValue(doc, key);

      if (typeof value === "object" && value !== null) {
        // Handle operators like $gt, $lt, etc.
        for (const [op, opValue] of Object.entries(value)) {
          switch (op) {
            case "$gt":
              if (!(docValue > opValue)) return false;
              break;
            case "$gte":
              if (!(docValue >= opValue)) return false;
              break;
            case "$lt":
              if (!(docValue < opValue)) return false;
              break;
            case "$lte":
              if (!(docValue <= opValue)) return false;
              break;
            case "$ne":
              if (docValue === opValue) return false;
              break;
            case "$in":
              if (!Array.isArray(opValue) || !opValue.includes(docValue)) return false;
              break;
            case "$nin":
              if (Array.isArray(opValue) && opValue.includes(docValue)) return false;
              break;
            default:
              // If it's not an operator, treat as equality check for object
              if (JSON.stringify(docValue) !== JSON.stringify(value)) return false;
          }
        }
      } else {
        // Direct equality
        if (docValue !== value) return false;
      }
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
  }

  private queryByIndex(filter: Partial<T>): string | null {
    const entries = Object.entries(filter);
    if (entries.length !== 1) return null;

    const [field, value] = entries[0];
    const index = this.indexes.get(field);
    if (!index) return null;

    const ids = index.get(value);
    if (ids && ids.size > 0) {
      return Array.from(ids)[0];
    }
    return null;
  }

  count(): number {
    return this.data.size;
  }
}
