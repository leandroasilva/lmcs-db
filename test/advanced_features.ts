import LmcsDB from '../src/LmcsDB';
import fs from 'fs';
import path from 'path';

interface Product {
  _id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
  details: {
    manufacturer: string;
    warranty: number;
  };
  status: string;
}

const DB_NAME = 'perf_test_db';
const DB_PATH = path.join(process.cwd(), `${DB_NAME}.db`);

async function runTest() {
  // Clean up previous run
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new LmcsDB({
    storageType: 'json',
    databaseName: DB_NAME
  });

  await db.initialize();
  const products = db.collection<Product>('products');

  console.log('Generating 10,000 products...');
  const count = 10000;
  const categories = ['Electronics', 'Books', 'Clothing', 'Home', 'Toys'];
  const statuses = ['Active', 'Inactive', 'Pending', 'Archived', 'Sold'];

  const startInsert = Date.now();
  for (let i = 0; i < count; i++) {
    await products.insert({
      name: `Product ${i}`,
      category: categories[i % categories.length],
      price: Math.floor(Math.random() * 1000),
      tags: [`tag${i % 10}`, `tag${i % 5}`],
      details: {
        manufacturer: `Maker ${i % 100}`,
        warranty: i % 24
      },
      status: statuses[i % statuses.length]
    });
  }
  const endInsert = Date.now();
  console.log(`Insertion took ${endInsert - startInsert}ms`);

  // Ensure persistence queue is flushed
  await db.flush();

  // Test 1: Query without index
  console.log('\n--- Query without Index ---');
  const t0 = Date.now();
  const resultsNoIndex = await products.findAll({
    filter: { category: 'Electronics' }
  });
  const t1 = Date.now();
  console.log(`Found ${resultsNoIndex.length} items in ${t1 - t0}ms (No Index)`);

  // Test 2: Create Index
  console.log('\n--- Creating Index on "category" ---');
  const tIndexStart = Date.now();
  await products.createIndex('category');
  const tIndexEnd = Date.now();
  console.log(`Index creation took ${tIndexEnd - tIndexStart}ms`);

  // Test 3: Query with Index
  console.log('\n--- Query with Index ---');
  const t2 = Date.now();
  const resultsWithIndex = await products.findAll({
    filter: { category: 'Electronics' }
  });
  const t3 = Date.now();
  console.log(`Found ${resultsWithIndex.length} items in ${t3 - t2}ms (With Index)`);

  if (resultsNoIndex.length !== resultsWithIndex.length) {
    console.error('ERROR: Result counts do not match!');
  }

  // Test 4: Nested Field Query
  console.log('\n--- Nested Field Query (details.manufacturer) ---');
  const t4 = Date.now();
  const nestedResults = await products.findAll({
    filter: { 'details.manufacturer': 'Maker 50' }
  });
  const t5 = Date.now();
  console.log(`Found ${nestedResults.length} items for manufacturer "Maker 50" in ${t5 - t4}ms`);
  
  // Verify correctness
  const validNested = nestedResults.every(p => p.details.manufacturer === 'Maker 50');
  console.log(`Nested query correct: ${validNested}`);

  // Test 5: $or Query
  console.log('\n--- $or Query (Category "Books" OR Price > 900) ---');
  const t6 = Date.now();
  const orResults = await products.findAll({
    filter: {
      $or: [
        { category: 'Books' },
        { price: { $gt: 900 } }
      ]
    }
  });
  const t7 = Date.now();
  console.log(`Found ${orResults.length} items in ${t7 - t6}ms`);
  
  // Verify correctness (partial check)
  const validOr = orResults.every(p => p.category === 'Books' || p.price > 900);
  console.log(`$or query correct: ${validOr}`);

  // Test 6: $and Query
  console.log('\n--- $and Query (Category "Clothing" AND Price < 100) ---');
  const t8 = Date.now();
  const andResults = await products.findAll({
    filter: {
      $and: [
        { category: 'Clothing' },
        { price: { $lt: 100 } }
      ]
    }
  });
  const t9 = Date.now();
  console.log(`Found ${andResults.length} items in ${t9 - t8}ms`);

  // Verify correctness
  const validAnd = andResults.every(p => p.category === 'Clothing' && p.price < 100);
  console.log(`$and query correct: ${validAnd}`);

  // Cleanup
  await db.flush();
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
}

runTest().catch(console.error);
