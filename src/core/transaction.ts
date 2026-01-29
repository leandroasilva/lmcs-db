import { IStorage, LogEntry } from '../storage/base';
import { TransactionError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

export interface Transaction {
  id: string;
  operations: Operation[];
  status: 'pending' | 'committed' | 'aborted';
  timestamp: number;
}

export interface Operation {
  type: 'insert' | 'update' | 'delete';
  collection: string;
  id: string;
  previousData?: unknown;
  newData?: unknown;
}

export class TransactionManager {
  private activeTransactions = new Map<string, Transaction>();
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async begin(): Promise<string> {
    const txId = uuidv4();
    const tx: Transaction = {
      id: txId,
      operations: [],
      status: 'pending',
      timestamp: Date.now()
    };
    
    this.activeTransactions.set(txId, tx);
    
    await this.storage.append({
      op: 'BEGIN',
      collection: '_transactions',
      id: txId,
      checksum: '',
      timestamp: tx.timestamp,
      txId
    });
    
    return txId;
  }

  async addOperation(txId: string, op: Operation): Promise<void> {
    const tx = this.activeTransactions.get(txId);
    if (!tx) throw new TransactionError('Transaction not found');
    if (tx.status !== 'pending') throw new TransactionError('Transaction already finalized');
    
    tx.operations.push(op);
  }

  async commit(txId: string): Promise<Operation[]> {
    const tx = this.activeTransactions.get(txId);
    if (!tx) throw new TransactionError('Transaction not found');
    
    // Apply operations to storage
    for (const op of tx.operations) {
      let storageOp: 'INSERT' | 'UPDATE' | 'DELETE';
      switch (op.type) {
        case 'insert': storageOp = 'INSERT'; break;
        case 'update': storageOp = 'UPDATE'; break;
        case 'delete': storageOp = 'DELETE'; break;
        default: continue;
      }

      await this.storage.append({
        op: storageOp,
        collection: op.collection,
        id: op.id,
        data: op.newData || {},
        checksum: '',
        timestamp: Date.now(),
        txId: txId
      });
    }
    
    await this.storage.append({
      op: 'COMMIT',
      collection: '_transactions',
      id: txId,
      checksum: '',
      timestamp: Date.now(),
      txId
    });
    
    const operations = [...tx.operations];
    tx.status = 'committed';
    this.activeTransactions.delete(txId);

    return operations;
  }

  async rollback(txId: string): Promise<void> {
    const tx = this.activeTransactions.get(txId);
    if (!tx) return;
    
    await this.storage.append({
      op: 'ROLLBACK',
      collection: '_transactions',
      id: txId,
      checksum: '',
      timestamp: Date.now(),
      txId
    });
    
    tx.status = 'aborted';
    this.activeTransactions.delete(txId);
  }

  getTransaction(txId: string): Transaction | undefined {
    return this.activeTransactions.get(txId);
  }

  async recover(): Promise<void> {
    const pendingTxs = new Map<string, Transaction>();
    
    for await (const entry of this.storage.readStream()) {
      if (entry.collection !== '_transactions') continue;
      
      if (entry.op === 'BEGIN') {
        pendingTxs.set(entry.id, {
          id: entry.id,
          operations: [],
          status: 'pending',
          timestamp: entry.timestamp
        });
      } else if (entry.op === 'COMMIT' || entry.op === 'ROLLBACK') {
        pendingTxs.delete(entry.id);
      }
    }
    
    for (const [txId, tx] of pendingTxs) {
      console.log(`Recovering incomplete transaction ${txId}`);
      await this.rollback(txId);
    }
  }
}