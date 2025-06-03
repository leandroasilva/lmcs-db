import { IDatabaseStorage } from '../interfaces';
declare class BinaryStorage implements IDatabaseStorage {
    private filePath;
    constructor(databaseName: string);
    save(data: string): Promise<void>;
    load(): Promise<string>;
}
export default BinaryStorage;
