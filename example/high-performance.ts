import { Database, StorageType } from '../src';
import { setTimeout } from 'timers/promises';

interface LogEntry {
  _id?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

async function highPerformanceExample() {
  // AOL (Append-Only Log) is perfect for high-write scenarios
  const db = await Database.create({
    storageType: StorageType.AOL,
    databaseName: 'app-logs',
    customPath: './logs',
    bufferSize: 1000, // Batch 1000 writes before fsync
    compactionInterval: 60000 // Compact every minute
  });

  const logs = db.collection<LogEntry>('logs');

  console.time('Bulk insert');

  // Insert 10,000 log entries
  const promises = Array(10000).fill(null).map((_, i) => 
    logs.insert({
      level: i % 100 === 0 ? 'error' : 'info',
      message: `Log message ${i}`,
      timestamp: Date.now(),
      metadata: { pid: process.pid, index: i }
    })
  );

  await Promise.all(promises);
  console.timeEnd('Bulk insert');

  // Streaming query (memory efficient for large datasets)
  console.time('Stream processing');
  
  let errorCount = 0;
  const stream = logs.findStream({ 
    filter: { level: 'error' },
    batchSize: 100 
  });

  for await (const error of stream) {
    errorCount++;
    // Process error (send alert, etc)
    if (errorCount % 100 === 0) {
      process.stdout.write('.');
    }
  }

  console.log(`\nFound ${errorCount} errors`);
  console.timeEnd('Stream processing');

  // Compact to save space (removes duplicates/old versions)
  console.log('Compacting...');
  await db.compact();

  await db.close();
}

highPerformanceExample();