import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { rm } from 'fs/promises';
import { Database } from '../src/core/database';
import { MemoryStorage } from '../src/storage';

interface Account {
  _id?: string;
  name: string;
  balance: number;
}

describe('ACID Transactions', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({
      storageType: 'memory',
      databaseName: 'test-tx'
    });
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should commit transaction', async () => {
    const accounts = db.collection<Account>('accounts');
    
    const result = await db.transaction(async (trx) => {
      const acc1 = await accounts.insert({ name: 'Alice', balance: 100 });
      await trx.update('accounts', acc1._id!, { balance: 50 });
      
      const acc2 = await accounts.insert({ name: 'Bob', balance: 0 });
      await trx.update('accounts', acc2._id!, { balance: 50 });
      
      return { acc1: acc1._id, acc2: acc2._id };
    });

    const alice = await accounts.findOne({ _id: result.acc1 });
    const bob = await accounts.findOne({ _id: result.acc2 });

    expect(alice?.balance).toBe(50);
    expect(bob?.balance).toBe(50);
  });

  it('should rollback on error', async () => {
    const accounts = db.collection<Account>('accounts');
    
    await accounts.insert({ _id: 'test-1', name: 'Test', balance: 100 });

    await expect(
      db.transaction(async (trx) => {
        await trx.update('accounts', 'test-1', { balance: 0 });
        throw new Error('Simulated failure');
      })
    ).rejects.toThrow('Simulated failure');

    const account = await accounts.findOne({ _id: 'test-1' });
    expect(account?.balance).toBe(100); // Should remain unchanged
  });

  it('should handle concurrent transactions', async () => {
    const counters = db.collection<{ _id?: string; value: number }>('counters');
    await counters.insert({ _id: 'counter-1', value: 0 });

    const promises = Array(10).fill(null).map((_, i) => 
      db.transaction(async (trx) => {
        const current = await counters.findOne({ _id: 'counter-1' });
        await trx.update('counters', 'counter-1', { value: (current?.value || 0) + 1 });
      })
    );

    await Promise.all(promises);
    
    const final = await counters.findOne({ _id: 'counter-1' });
    expect(final?.value).toBe(10);
  });
});