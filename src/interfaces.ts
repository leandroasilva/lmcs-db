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

interface IndexOptions {
  unique?: boolean;
}

interface Collection {
  name: CollectionName;
  documents: Record<DocumentID, DatabaseDocument>;
  indices?: Record<string, IndexOptions>;
}

interface DatabaseSchema {
  collections: Record<CollectionName, Collection>;
}

interface FindOptions<T> {
  filter?: {
    $or?: Array<Partial<T> | Record<string, any>>;
    $and?: Array<Partial<T> | Record<string, any>>;
    [key: string]: any; 
  } & {
    [key in keyof T]?: T[key] | {
      $eq?: T[key];
      $ne?: T[key];
      $gt?: T[key];
      $lt?: T[key];
      $in?: T[key][];
      $nin?: T[key][];
      $contains?: T[key];
      $regex?: RegExp;
      $exists?: boolean;
      $startsWith?: string;
      $endsWith?: string;
      $between?: [T[key], T[key]];
    };
  };
  limit?: number;
  sort?: { [K in keyof T]?: 1 | -1 };
}

interface DatabaseConfig {
  encryptionKey?: string;
  storageType: 'memory' | 'json' | 'binary';
  databaseName?: string;
  customPath?: string;
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
