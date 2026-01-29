import { TransactionManager } from './transaction';
import { IStorage } from '../storage/base';
import { v4 as uuidv4 } from 'uuid';

export class TransactionContext {
  constructor(
    private txId: string,
    private txManager: TransactionManager,
    private storage: IStorage
  ) {}

  get id(): string {
    return this.txId;
  }

  async insert(collection: string, data: any): Promise<void> {
    await this.txManager.addOperation(this.txId, {
      type: 'insert',
      collection,
      id: data._id || uuidv4(),
      newData: data
    });
  }

  async update(collection: string, id: string, data: any): Promise<void> {
    await this.txManager.addOperation(this.txId, {
      type: 'update',
      collection,
      id,
      newData: data
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
