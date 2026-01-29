import { IStorage } from '../storage/base';
import { TransactionManager } from './transaction';
import { v7 as uuidv7 } from 'uuid';

export class TransactionContext {
  constructor(
    private txId: string,
    private txManager: TransactionManager,
    private storage: IStorage,
    private getData: (collection: string, id: string) => Promise<any>
  ) {}

  get id(): string {
    return this.txId;
  }

  async insert(collection: string, data: any): Promise<void> {
    await this.txManager.addOperation(this.txId, {
      type: 'insert',
      collection,
      id: data._id || uuidv7(),
      newData: data
    });
  }

  async update(collection: string, id: string, data: any): Promise<void> {
    const current = await this.getData(collection, id);
    if (!current) {
        throw new Error(`Document with id ${id} not found in collection ${collection}`);
    }
    const newData = { ...current, ...data };
    
    await this.txManager.addOperation(this.txId, {
      type: 'update',
      collection,
      id,
      newData: newData
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.txManager.addOperation(this.txId, {
      type: 'delete',
      collection,
      id
    });
  }
}