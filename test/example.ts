import { LmcsDB } from '../src/index';

interface User {
  _id?: string;
  name: string;
  email: string;
  age: number;
}

async function demoStorage(type: 'memory' | 'json' | 'aol' | 'binary', name: string) {
  console.log(`\n=== Testing ${name.toUpperCase()} ===`);
  
  const db = new LmcsDB({
    storageType: type,
    databaseName: `test-${type}`,
    encryptionKey: 'minha-chave-super-secreta-com-32-bytes!',
    customPath: './data',
    enableTransactions: type !== 'memory'
  });

  await db.initialize();
  
  const users = db.collection<User>('users');
  users.createIndex('email', { unique: true });

  // Insert
  const u1 = await users.insert({ name: 'Alice', email: 'alice@test.com', age: 28 });
  console.log(`[${name}] Inserted:`, u1._id?.slice(0,8));

  // Find
  const found = await users.findOne({ email: 'alice@test.com' });
  console.log(`[${name}] Found:`, found?.name);

  // Update
  await users.update({ name: 'Alice' }, { age: 29 });
  const updated = await users.findOne({ name: 'Alice' });
  console.log(`[${name}] Updated age:`, updated?.age);

  // Transação (se suportado)
  if (type !== 'memory') {
    try {
      await db.transaction(async (trx) => {
        await trx.insert('users', { 
          name: 'Temp', 
          email: 'temp@test.com', 
          age: 99, 
          _id: 'temp-123' 
        });
        throw new Error('Rollback test');
      });
    } catch {
      const temp = await users.findOne({ _id: 'temp-123' });
      console.log(`[${name}] Transaction rollback OK:`, temp === null);
    }
  }

  console.log(`[${name}] Stats:`, db.stats());
  await db.close();
  console.log(`[${name}] Closed successfully`);
}

async function main() {
  await demoStorage('memory', 'Memory');
  await demoStorage('json', 'JSON');
  await demoStorage('binary', 'Binary');
  await demoStorage('aol', 'AOL (Append-Only)');
  
  console.log('\n✅ All storage types tested successfully!');
}

main().catch(console.error);