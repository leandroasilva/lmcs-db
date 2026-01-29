import { LmcsDB } from '../src';

async function main() {
  // Chave passada explicitamente pelo usuário
  const db = new LmcsDB({
    storageType: 'aol',
    databaseName: 'myapp',
    encryptionKey: 'minha-chave-muito-secreta-e-longa-32bytes!',
    enableTransactions: true,
    compactionInterval: 300000 // 5 minutos
  });

  await db.initialize();

  const users = db.collection<{ _id?: string; name: string; email: string }>('users');

  // Criar índice
  users.createIndex('email', { unique: true });

  // Inserir
  await users.insert({ name: 'Alice', email: 'alice@test.com' });

  // Transação
  await db.transaction(async (trx) => {
    await trx.insert('users', { name: 'Bob', email: 'bob@test.com' });
    await trx.update('users', 'some-id', { name: 'Bob Updated' });
  });

  // Buscar
  const result = await users.findAll({
    filter: { name: 'Alice' },
    limit: 10
  });

  console.log(result);

  await db.close();
}

main().catch(console.error);
