import { Database, StorageType } from '../src';

interface Account {
  _id?: string;
  holder: string;
  balance: number;
  currency: string;
}

async function transferExample() {
  const db = await Database.create({
    storageType: StorageType.Binary, // Fast and compact
    databaseName: 'bank',
    encryptionKey: 'bank-secret-32-chars-long!!!',
    enableChecksums: true
  });

  const accounts = db.collection<Account>('accounts');

  // Setup accounts
  const [alice, bob] = await Promise.all([
    accounts.insert({ holder: 'Alice', balance: 1000, currency: 'USD' }),
    accounts.insert({ holder: 'Bob', balance: 500, currency: 'USD' })
  ]);

  try {
    // ACID Transaction: Transfer $100 from Alice to Bob
    await db.transaction(async (trx) => {
      // Read current balances
      const from = await accounts.findOne({ _id: alice._id });
      const to = await accounts.findOne({ _id: bob._id });

      if (!from || !to) throw new Error('Account not found');
      if (from.balance < 100) throw new Error('Insufficient funds');

      // Deduct from Alice
      await trx.update('accounts', alice._id!, { 
        balance: from.balance - 100 
      });

      // Add to Bob
      await trx.update('accounts', bob._id!, { 
        balance: to.balance + 100 
      });

      // If any error occurs above, both updates are rolled back
      console.log('Transfer committed successfully');
    });

  } catch (error) {
    console.error('Transfer failed:', error);
    console.log('Both accounts remain unchanged (ACID rollback)');
  }

  // Verify final state
  const finalAlice = await accounts.findOne({ _id: alice._id });
  const finalBob = await accounts.findOne({ _id: bob._id });

  console.log(`Alice: $${finalAlice?.balance}`); // Should be 900
  console.log(`Bob: $${finalBob?.balance}`); // Should be 600

  await db.close();
}

transferExample();