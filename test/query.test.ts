import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database } from '../src/core/database';
import { MemoryStorage } from '../src/storage';

interface Product {
  _id?: string;
  name: string;
  price: number;
  category: string;
  tags: string[];
  active: boolean;
}

describe('Advanced Queries', () => {
  let db: Database;
  let products: ReturnType<typeof db.collection<Product>>;

  beforeAll(async () => {
    db = new Database({ storageType: 'memory', databaseName: 'query-test' });
    await db.initialize();
    products = db.collection<Product>('products');

    // Seed data
    await Promise.all([
      products.insert({ name: 'iPhone', price: 999, category: 'tech', tags: ['phone', 'apple'], active: true }),
      products.insert({ name: 'MacBook', price: 1999, category: 'tech', tags: ['laptop', 'apple'], active: true }),
      products.insert({ name: 'Banana', price: 1, category: 'food', tags: ['fruit'], active: true }),
      products.insert({ name: 'Orange', price: 2, category: 'food', tags: ['fruit', 'vitamin-c'], active: false }),
      products.insert({ name: 'Car', price: 20000, category: 'vehicle', tags: ['expensive'], active: true }),
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  it('should query with $gt operator', async () => {
    const expensive = await products.findAll({
      filter: { price: { $gt: 1000 } }
    });
    
    expect(expensive).toHaveLength(2);
    expect(expensive.map(p => p.name)).toContain('MacBook');
    expect(expensive.map(p => p.name)).toContain('Car');
  });

  it('should query with $or operator', async () => {
    const result = await products.findAll({
      filter: {
        $or: [
          { category: 'food' },
          { price: { $gt: 1500 } }
        ]
      }
    });

    expect(result.length).toBeGreaterThanOrEqual(3); // Banana, Orange, MacBook, Car
  });

  it('should handle pagination', async () => {
    const page1 = await products.findAll({ limit: 2, skip: 0 });
    const page2 = await products.findAll({ limit: 2, skip: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0]._id).not.toBe(page2[0]._id);
  });

  it('should sort results', async () => {
    const sorted = await products.findAll({
      sort: { price: -1 } // Descending
    });

    expect(sorted[0].price).toBe(20000);
    expect(sorted[sorted.length - 1].price).toBe(1);
  });

  it('should stream large datasets', async () => {
    const stream = products.findStream({ batchSize: 2 });
    const items: Product[] = [];

    for await (const item of stream) {
      items.push(item);
    }

    expect(items.length).toBe(5);
  });
});