import { DatabaseFactory, DatabaseStorageType } from '../src';

// Definir tipos
interface User {
  _id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  category: string;
}

async function demo() {

  // Configuração com criptografia
  const db = await DatabaseFactory.create({
    storageType: DatabaseStorageType.Binary, //tipo de armazenamento
    databaseName: 'secure-db', //nome do banco
    customPath: `${process.cwd()}/test/data`, //path para armazenamento
    encryptionKey: 'my-super-secret-key-123!' //Senha para criptografia do banco
  });

  // Trabalhar com diferentes coleções
  const users = db.collection<User>('users');
  const products = db.collection<Product>('products');

  // Inserir usuários
  const user1 = await users.insert({
    name: 'Alice',
    email: 'alice@example.com',
    age: 30,
    active: true
  });

  // Inserir produtos
  const product1 = await products.insert({
    name: 'Laptop',
    price: 1200,
    category: 'Electronics'
  });

  // Contar usuários no banco.
  const userCount = await users.count();
  console.log('User count:', userCount);
  
  // Buscar todos os usuários ativos
  const activeUsers = await users.findAll({
    filter: { active: true }
  });
  console.log('Active users:', activeUsers);

  // Buscar produtos caros
  const expensiveProducts = await products.findAll({
    filter: { price: { $gt: 1000 } },
    sort: { price: -1 } // Ordenar por preço decrescente
  });
  console.log('Expensive products:', expensiveProducts);

  // Atualizar um usuário
  await users.update(user1._id, { age: 31 });
  console.log('User updated');

  // Deletar um produto
  await products.delete(product1._id);
  console.log('Product deleted');
}

demo().catch(console.error);