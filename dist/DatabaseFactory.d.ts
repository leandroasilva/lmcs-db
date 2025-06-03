import { DatabaseConfig } from "./interfaces";
import LmcsDB from "./LmcsDB";
declare class DatabaseFactory {
    static create(config: DatabaseConfig): Promise<LmcsDB>;
}
export default DatabaseFactory;
