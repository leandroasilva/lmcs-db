// Tipos básicos
type DocumentID = string;
type CollectionName = string;

interface IDatabaseStorage {
  save(data: string): Promise<void>;
  load(): Promise<string>;
}

interface DatabaseDocument {
  _id: DocumentID;
  [key: string]: any;
}

interface Collection {
  name: CollectionName;
  documents: Record<DocumentID, DatabaseDocument>;
}

interface DatabaseSchema {
  collections: Record<CollectionName, Collection>;
}

interface FindOptions<T> {
  filter?: {
    [key in keyof T]?: T[key] | {
      $eq?: T[key];
      $ne?: T[key];
      $gt?: T[key];
      $lt?: T[key];
      $in?: T[key][];
    };
  };
  limit?: number;
  sort?: { [K in keyof T]?: 1 | -1 };
}

interface DatabaseConfig {
  encryptionKey?: string;
  storageType: 'memory' | 'json' | 'binary';
  databaseName?: string;
}

enum DatabaseStorageType {
  Memory = 'memory',
  Json = 'json',
  Binary = 'binary'
}

export {
  DocumentID,
  CollectionName,
  DatabaseDocument,
  Collection,
  DatabaseSchema,
  FindOptions,
  DatabaseConfig,
  IDatabaseStorage,
  DatabaseStorageType
};