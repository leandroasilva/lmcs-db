import { Database, StorageType } from '../src';

async function benchmarkStorage(type: StorageType, name: string) {
  console.log(`\n=== Benchmarking ${name} ===`);
  
  const start = Date.now();
  const db = await Database.create({
    storageType: type,
    databaseName: `bench-${type}`,
    customPath: './benchmark-data'
  });

  const col = db.collection<{ index: number; data: string }>('items');
  
  // Write
  const writeStart = Date.now();
  for (let i = 0; i < 1000; i++) {
    await col.insert({ 
      index: i, 
      data: 'x'.repeat(100) // 100 bytes per record
    });
  }
  console.log(`Write 1000 items: ${Date.now() - writeStart}ms`);

  // Read
  const readStart = Date.now();
  const all = await col.findAll();
  console.log(`Read ${all.length} items: ${Date.now() - readStart}ms`);

  // File size info (for file-based storages)
  const fs = await import('fs/promises');
  const path = `./benchmark-data/bench-${type}.${type === StorageType.JSON ? 'json' : type === StorageType.Binary ? 'bin' : 'aol'}`;
  
  try {
    const stats = await fs.stat(path);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
  } catch {
    console.log('Memory storage (no file)');
  }

  await db.close();
  console.log(`Total time: ${Date.now() - start}ms`);
}

async function compareStorages() {
  await benchmarkStorage(StorageType.Memory, 'Memory (Volatile)');
  await benchmarkStorage(StorageType.JSON, 'JSON (Human Readable)');
  await benchmarkStorage(StorageType.Binary, 'Binary (Compact)');
  await benchmarkStorage(StorageType.AOL, 'AOL (Append-Only)');

  console.log('\n=== Recommendations ===');
  console.log('• Memory: Use for caching, tests, or temporary data');
  console.log('• JSON: Use for configuration files or small datasets (< 10MB)');
  console.log('• Binary: Use for medium datasets requiring fast reads');
  console.log('• AOL: Use for logs, event sourcing, or high-write workloads');
}

compareStorages().then(() => process.exit(0));