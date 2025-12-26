import LmcsDB from '../src/LmcsDB';
import fs from 'fs';
import path from 'path';

const DB_NAME = 'benchmark_aol';
const DB_PATH = path.join(process.cwd(), `${DB_NAME}.aol`);
const DB_JSON_NAME = 'benchmark_json';
const DB_JSON_PATH = path.join(process.cwd(), `${DB_JSON_NAME}.db`);
const DB_ENC_NAME = 'benchmark_aol_enc';
const DB_ENC_PATH = path.join(process.cwd(), `${DB_ENC_NAME}.aol`);

async function runBenchmark() {
  // Cleanup
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  if (fs.existsSync(DB_JSON_PATH)) fs.unlinkSync(DB_JSON_PATH);
  if (fs.existsSync(DB_ENC_PATH)) fs.unlinkSync(DB_ENC_PATH);

  const count = 50000;
  console.log(`Starting Benchmark: ${count} operations`);

  // --- JSON Storage ---
  console.log('\n--- JSON Storage (Rewrite) ---');
  const dbJson = new LmcsDB({
    storageType: 'json',
    databaseName: DB_JSON_NAME
  });
  await dbJson.initialize();
  const colJson = dbJson.collection('items');
  
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    await colJson.insert({ value: i, data: 'x'.repeat(100) });
    // Simulate slight delay to allow some async persistence to happen
    if (i % 1000 === 0) await new Promise(r => setImmediate(r));
  }
  // Flush to ensure everything is written
  await dbJson.flush();
  const t1 = Date.now();
  console.log(`JSON Insert Time: ${t1 - t0}ms`);
  
  // --- AOL Storage ---
  console.log('\n--- AOL Storage (Append) ---');
  const dbAol = new LmcsDB({
    storageType: 'aol',
    databaseName: DB_NAME
  });
  await dbAol.initialize();
  const colAol = dbAol.collection('items');
  
  const t2 = Date.now();
  for (let i = 0; i < count; i++) {
    await colAol.insert({ value: i, data: 'x'.repeat(100) });
    if (i % 1000 === 0) await new Promise(r => setImmediate(r));
  }
  await dbAol.flush();
  const t3 = Date.now();
  console.log(`AOL Insert Time: ${t3 - t2}ms`);
  
  // Verify Data Integrity
  console.log('\n--- Verifying AOL Data Integrity ---');
  const dbAol2 = new LmcsDB({
    storageType: 'aol',
    databaseName: DB_NAME
  });
  await dbAol2.initialize();
  const countAol = await dbAol2.collection('items').count();
  console.log(`AOL Count after reload: ${countAol} (Expected: ${count})`);
  
  if (countAol !== count) {
      console.error('ERROR: Data loss detected in AOL!');
  } else {
      console.log('SUCCESS: Data integrity verified.');
  }

  // --- AOL Compaction Test ---
  console.log('\n--- AOL Compaction Test ---');
  const sizeBefore = fs.statSync(DB_NAME + '.aol').size;
  console.log(`Size before compaction: ${(sizeBefore / 1024 / 1024).toFixed(2)} MB`);
  
  const tCompactionStart = Date.now();
  await dbAol.compact();
  const tCompactionEnd = Date.now();
  console.log(`Compaction Time: ${tCompactionEnd - tCompactionStart}ms`);
  
  const sizeAfter = fs.statSync(DB_NAME + '.aol').size;
  console.log(`Size after compaction: ${(sizeAfter / 1024 / 1024).toFixed(2)} MB`);
  
  // Verify Data Integrity After Compaction
  const dbAol3 = new LmcsDB({
      storageType: 'aol',
      databaseName: DB_NAME
  });
  await dbAol3.initialize();
  const countAol3 = await dbAol3.collection('items').count();
  console.log(`AOL Count after compaction reload: ${countAol3} (Expected: ${count})`);

  if (countAol3 !== count) {
      console.error('ERROR: Data loss detected after compaction!');
  } else {
      console.log('SUCCESS: Data integrity verified after compaction.');
  }

  // --- Auto-Compaction Test ---
  console.log('\n--- Auto-Compaction Test ---');
  const DB_AUTO_NAME = 'benchmark_auto_compact';
  const DB_AUTO_PATH = path.join(process.cwd(), `${DB_AUTO_NAME}.aol`);
  if (fs.existsSync(DB_AUTO_PATH)) fs.unlinkSync(DB_AUTO_PATH);

  const dbAuto = new LmcsDB({
      storageType: 'aol',
      databaseName: DB_AUTO_NAME,
      compactionInterval: 100 // Compact every 100ms
  });
  await dbAuto.initialize();
  
  // Insert data rapidly
  for(let i=0; i<500; i++) {
      const doc = await dbAuto.collection('test').insert({ i, v: 1 });
      await dbAuto.collection('test').update(doc._id, { v: 2 }); // Double the lines
  }
  
  // Wait for compaction
  console.log('Waiting for auto-compaction...');
  await new Promise(r => setTimeout(r, 1100)); // Wait > 1s to ensure it runs
  
  const sizeAuto = fs.statSync(DB_AUTO_PATH).size;
  // 500 records * small size should be small. 
  // If not compacted, it would have 1000 lines.
  console.log(`Size after auto-compaction: ${sizeAuto} bytes`);
  
  await dbAuto.close();
  if (fs.existsSync(DB_AUTO_PATH)) fs.unlinkSync(DB_AUTO_PATH);
  
  // --- Encrypted AOL Storage ---
  console.log('\n--- Encrypted AOL Storage ---');
  const secretKey = 'my-secret-key-123';
  const dbEnc = new LmcsDB({
    storageType: 'aol',
    databaseName: DB_ENC_NAME,
    encryptionKey: secretKey
  });
  await dbEnc.initialize();
  const colEnc = dbEnc.collection('secrets');
  
  await colEnc.insert({ secret: 'Top Secret Data', id: 1 });
  await dbEnc.flush();
  
  // Verify encryption on disk
  const rawContent = fs.readFileSync(DB_ENC_PATH, 'utf-8');
  console.log('Raw File Content Preview:', rawContent.substring(0, 100) + '...');
  if (rawContent.includes('Top Secret Data')) {
      console.error('ERROR: Data is NOT encrypted on disk!');
  } else {
      console.log('SUCCESS: Data is encrypted on disk.');
  }
  
  // Verify decryption on load
  const dbEnc2 = new LmcsDB({
    storageType: 'aol',
    databaseName: DB_ENC_NAME,
    encryptionKey: secretKey
  });
  await dbEnc2.initialize();
  const secretDocs = await dbEnc2.collection('secrets').findAll();
  if (secretDocs.length > 0 && secretDocs[0].secret === 'Top Secret Data') {
      console.log('SUCCESS: Data successfully decrypted on load.');
  } else {
      console.error('ERROR: Failed to decrypt data!', secretDocs);
  }

  // Cleanup
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  if (fs.existsSync(DB_JSON_PATH)) fs.unlinkSync(DB_JSON_PATH);
  if (fs.existsSync(DB_ENC_PATH)) fs.unlinkSync(DB_ENC_PATH);
}

runBenchmark().catch(console.error);
