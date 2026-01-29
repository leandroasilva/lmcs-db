import { Database, StorageType } from '../src';

interface User {
  _id?: string;
  name: string;
  email: string;
  createdAt: Date;
}

async function basicExample() {
  // 1. Create database with JSON storage (good for development)
  const db = await Database.create({
    storageType: StorageType.JSON,
    databaseName: 'my-app',
    customPath: './data',
    encryptionKey: 'optional-secret-key' // Remove for unencrypted
  });

  // 2. Get collection
  const users = db.collection<User>('users');

  // 3. Insert
  const user = await users.insert({
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date()
  });

  console.log('Created:', user._id);

  // 4. Query
  const found = await users.findOne({ email: 'john@example.com' });
  console.log('Found:', found?.name);

  // 5. Update
  await users.update(
    { _id: user._id },
    { name: 'John Updated' }
  );

  // 6. List all with pagination
  const all = await users.findAll({
    sort: { createdAt: -1 },
    limit: 10,
    skip: 0
  });

  console.log('Total users:', await users.count());

  await db.close();
}

basicExample().catch(console.error);