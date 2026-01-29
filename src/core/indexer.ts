export interface IndexDefinition {
  fields: string[];
  unique: boolean;
  sparse: boolean;
  name: string;
}

export class IndexManager {
  private indexes = new Map<string, Map<string, Map<string, Set<string>>>>(); 
  private indexDefs = new Map<string, IndexDefinition[]>();

  createIndex(
    collection: string, 
    fields: string | string[], 
    options?: { unique?: boolean; sparse?: boolean }
  ): void {
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    const key = fieldArray.join(':');
    
    if (!this.indexes.has(collection)) {
      this.indexes.set(collection, new Map());
      this.indexDefs.set(collection, []);
    }
    
    const colIndexes = this.indexes.get(collection)!;
    
    if (colIndexes.has(key)) {
      throw new Error(`Index already exists on ${key}`);
    }
    
    colIndexes.set(key, new Map());
    this.indexDefs.get(collection)!.push({
      fields: fieldArray,
      unique: options?.unique ?? false,
      sparse: options?.sparse ?? false,
      name: key
    });
  }

  indexDocument(collection: string, id: string, doc: Record<string, any>): void {
    const colIndexes = this.indexes.get(collection);
    if (!colIndexes) return;

    for (const [key, indexMap] of colIndexes) {
      const value = this.extractKeyValue(doc, key);
      if (value === undefined) continue;
      
      const valueKey = JSON.stringify(value);
      
      if (!indexMap.has(valueKey)) {
        indexMap.set(valueKey, new Set());
      }
      
      indexMap.get(valueKey)!.add(id);
    }
  }

  removeDocument(collection: string, id: string, doc: Record<string, any>): void {
    const colIndexes = this.indexes.get(collection);
    if (!colIndexes) return;

    for (const [key, indexMap] of colIndexes) {
      const value = this.extractKeyValue(doc, key);
      if (value === undefined) continue;
      
      const valueKey = JSON.stringify(value);
      const set = indexMap.get(valueKey);
      if (set) {
        set.delete(id);
        if (set.size === 0) indexMap.delete(valueKey);
      }
    }
  }

  queryByIndex(
    collection: string, 
    filter: Record<string, any>
  ): Set<string> | null {
    const colIndexes = this.indexes.get(collection);
    if (!colIndexes) return null;

    const candidates: Set<string>[] = [];
    
    for (const [key, indexMap] of colIndexes) {
      const filterValue = this.extractKeyValue(filter, key);
      if (filterValue !== undefined) {
        const result = indexMap.get(JSON.stringify(filterValue));
        if (result && result.size > 0) candidates.push(new Set(result));
      }
    }

    if (candidates.length === 0) return null;
    
    if (candidates.length === 1) return candidates[0];
    
    return candidates.reduce((a, b) => new Set([...a].filter(x => b.has(x))));
  }

  private extractKeyValue(doc: any, key: string): any {
    const fields = key.split(':');
    const values = fields.map(f => this.getNestedValue(doc, f));
    return fields.length === 1 ? values[0] : values;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  getIndexDefinitions(collection: string): IndexDefinition[] {
    return this.indexDefs.get(collection) || [];
  }
}