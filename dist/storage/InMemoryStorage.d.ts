import { IDatabaseStorage } from "../interfaces";
declare class InMemoryStorage implements IDatabaseStorage {
    private data;
    save(data: string): Promise<void>;
    load(): Promise<string>;
}
export default InMemoryStorage;
