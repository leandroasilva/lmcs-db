// Tipos básicos
type DocumentID = string;
type CollectionName = string;

interface LogEntry {
  op: 'i' | 'u' | 'd';
  col: string;
  id: string;
  doc?: any;
}

interface IDatabaseStorage {
  save(data: string): Promise<void>;
  load(): Promise<string>;
  append?(entry: LogEntry): Promise<void>;
  compact?(schema: DatabaseSchema, encryptionService?: any): Promise<void>;
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
  skip?: number;
  sort?: { [K in keyof T]?: 1 | -1 };
}

interface DatabaseConfig {
  encryptionKey?: string;
  storageType: 'memory' | 'json' | 'binary' | 'aol';
  databaseName?: string;
  customPath?: string;
  /**
   * Intervalo em milissegundos para rodar a compactação automática do log (apenas AOL).
   * Se não definido, a compactação deve ser chamada manualmente via db.compact().
   */
  compactionInterval?: number;
}

enum DatabaseStorageType {
  Memory = 'memory',
  Json = 'json',
  Binary = 'binary',
  Aol = 'aol'
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
  DatabaseStorageType,
  LogEntry
};
