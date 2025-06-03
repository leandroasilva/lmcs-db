import { DatabaseConfig, DatabaseDocument, FindOptions } from './interfaces';
declare class LmcsDB {
    private storage;
    private schema;
    private encryptionService?;
    private config;
    constructor(config: DatabaseConfig);
    initialize(): Promise<void>;
    save(): Promise<void>;
    collection<T extends DatabaseDocument>(name: string): {
        insert: (document: Omit<T, "_id">) => Promise<T>;
        find: (id: string) => Promise<T | null>;
        findAll: (options?: FindOptions<T>) => Promise<T[]>;
        update: (id: string, update: Partial<T>) => Promise<T | null>;
        delete: (id: string) => Promise<boolean>;
    };
}
export default LmcsDB;
