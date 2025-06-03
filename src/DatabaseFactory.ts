import { DatabaseConfig } from "./interfaces";
import LmcsDB from "./LmcsDB";

class DatabaseFactory {
  static async create(config: DatabaseConfig): Promise<LmcsDB> {
    const db = new LmcsDB(config);
    await db.initialize();
    return db;
  }
}

export default DatabaseFactory;