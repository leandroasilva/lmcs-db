import { LogEntry, IStorage } from '../storage/base';
import { IndexManager } from './indexer';
import { TransactionManager } from './transaction';
import { ValidationError } from '../utils/errors';
import { v7 as uuidv7 } from 'uuid';

export interface QueryOptions {
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export class SecureCollection<T extends Record<string, any>> {
  private data = new Map<string, T>();

  constructor(
    private name: string,
    private storage: IStorage,
    private indexer: IndexManager,
    private txManager?: TransactionManager
  ) {}

  private generateId(): string {
    return uuidv7();
  }

  private matchesFilter(doc: T, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('$')) {
        if (key === '$or') {
          if (!Array.isArray(value)) return false;
          return value.some((subFilter: any) => this.matchesFilter(doc, subFilter));
        }
        if (key === '$and') {
          if (!Array.isArray(value)) return false;
          return value.every((subFilter: any) => this.matchesFilter(doc, subFilter));
        }
        if (key === '$gt') {
          const [field, val] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return docVal > val;
        }
        if (key === '$gte') {
          const [field, val] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return docVal >= val;
        }
        if (key === '$lt') {
          const [field, val] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return docVal < val;
        }
        if (key === '$lte') {
          const [field, val] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return docVal <= val;
        }
        if (key === '$ne') {
          const [field, val] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return docVal !== val;
        }
        if (key === '$in') {
          const [field, arr] = Object.entries(value)[0];
          const docVal = this.getNestedValue(doc, field);
          return Array.isArray(arr) && arr.includes(docVal);
        }
        continue;
      }
      
      const docValue = this.getNestedValue(doc, key);
      if (docValue !== value) return false;
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  async insert(doc: Omit<T, '_id'> & { _id?: string }, txId?: string): Promise<T> {
    const id = doc._id || this.generateId();
    const fullDoc = { ...doc, _id: id } as unknown as T;
    
    if (this.data.has(id)) {
      throw new ValidationError(`Document with id ${id} already exists`);
    }

    // Verifica índices únicos
    const uniqueIndexes = this.indexer.getIndexDefinitions(this.name).filter(idx => idx.unique);
    for (const idx of uniqueIndexes) {
      const val = this.getNestedValue(fullDoc, idx.fields[0]);
      if (val !== undefined) {
        const existing = this.indexer.queryByIndex(this.name, { [idx.fields[0]]: val });
        if (existing && existing.size > 0) {
          throw new ValidationError(`Unique constraint violation on ${idx.fields.join(',')}`);
        }
      }
    }

    if (txId && this.txManager) {
      await this.txManager.addOperation(txId, {
        type: 'insert',
        collection: this.name,
        id,
        newData: fullDoc
      });
    }

    await this.storage.append({
      op: 'INSERT',
      collection: this.name,
      id,
      data: fullDoc,
      checksum: '',
      timestamp: Date.now(),
      txId
    });

    this.data.set(id, fullDoc);
    this.indexer.indexDocument(this.name, id, fullDoc);
    
    return fullDoc;
  }

  async findOne(filter: Record<string, any>): Promise<T | null> {
    const indexed = this.indexer.queryByIndex(this.name, filter);
    
    if (indexed) {
      for (const id of indexed) {
        const doc = this.data.get(id);
        if (doc && this.matchesFilter(doc, filter)) return doc;
      }
    }

    for (const doc of this.data.values()) {
      if (this.matchesFilter(doc, filter)) return doc;
    }
    
    return null;
  }

  async findAll(options: QueryOptions = {}): Promise<T[]> {
    let results: T[] = Array.from(this.data.values());
    
    if (options.filter) {
      results = results.filter(doc => this.matchesFilter(doc, options.filter!));
    }
    
    if (options.sort) {
      results.sort((a, b) => {
        for (const [field, order] of Object.entries(options.sort!)) {
          const aVal = this.getNestedValue(a, field);
          const bVal = this.getNestedValue(b, field);
          if (aVal < bVal) return order === 1 ? -1 : 1;
          if (aVal > bVal) return order === 1 ? 1 : -1;
        }
        return 0;
      });
    }
    
    if (options.skip) {
      results = results.slice(options.skip);
    }
    
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    
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
      if (options.filter && !this.matchesFilter(doc, options.filter)) continue;

      if (options.skip && skipped < options.skip) {
        skipped++;
        continue;
      }

      if (options.limit && count >= options.limit) break;

      yield doc;
      count++;
    }
  }

  async update(filter: Record<string, any>, updates: Partial<T>, txId?: string): Promise<number> {
    let count = 0;
    const docsToUpdate: Array<{ id: string; oldDoc: T; newDoc: T }> = [];
    
    for (const [id, doc] of this.data.entries()) {
      if (this.matchesFilter(doc, filter)) {
        const newDoc = { ...doc, ...updates, _id: id } as unknown as T;
        docsToUpdate.push({ id, oldDoc: doc, newDoc });
      }
    }
    
    for (const { id, oldDoc, newDoc } of docsToUpdate) {
      if (txId && this.txManager) {
        await this.txManager.addOperation(txId, {
          type: 'update',
          collection: this.name,
          id,
          previousData: oldDoc,
          newData: newDoc
        });
      }
      
      await this.storage.append({
        op: 'UPDATE',
        collection: this.name,
        id,
        data: newDoc,
        checksum: '',
        timestamp: Date.now(),
        txId
      });
      
      this.indexer.removeDocument(this.name, id, oldDoc);
      this.data.set(id, newDoc);
      this.indexer.indexDocument(this.name, id, newDoc);
      count++;
    }
    
    return count;
  }

  async remove(filter: Record<string, any>, txId?: string): Promise<number> {
    let count = 0;
    const toDelete: Array<{ id: string; doc: T }> = [];
    
    for (const [id, doc] of this.data.entries()) {
      if (this.matchesFilter(doc, filter)) {
        toDelete.push({ id, doc });
      }
    }
    
    for (const { id, doc: oldDoc } of toDelete) {
      if (txId && this.txManager) {
        await this.txManager.addOperation(txId, {
          type: 'delete',
          collection: this.name,
          id,
          previousData: oldDoc
        });
      }
      
      await this.storage.append({
        op: 'DELETE',
        collection: this.name,
        id,
        checksum: '',
        timestamp: Date.now(),
        txId
      });
      
      this.indexer.removeDocument(this.name, id, oldDoc);
      this.data.delete(id);
      count++;
    }
    
    return count;
  }

  createIndex(field: string | string[], options?: { unique?: boolean }): void {
    this.indexer.createIndex(this.name, field, options);
  }

  count(): number {
    return this.data.size;
  }

  loadFromLog(entry: LogEntry): void {
    if (entry.collection !== this.name) return;
    
    if (entry.op === 'INSERT' || entry.op === 'UPDATE') {
      this.data.set(entry.id, entry.data as T);
      this.indexer.indexDocument(this.name, entry.id, entry.data as Record<string, any>);
    } else if (entry.op === 'DELETE') {
      const oldDoc = this.data.get(entry.id);
      if (oldDoc) {
        this.indexer.removeDocument(this.name, entry.id, oldDoc as Record<string, any>);
      }
      this.data.delete(entry.id);
    }
  }
}
