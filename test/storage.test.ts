import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { rm } from 'fs/promises';
import { MemoryStorage, JSONStorage, AOLStorage, BinaryStorage } from '../src/storage';
import { CryptoManager } from '../src/crypto/manager';

const TEST_PATH = join(__dirname, 'temp');

describe('Storage Engines', () => {
  beforeEach(async () => {
    await rm(TEST_PATH, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(TEST_PATH, { recursive: true, force: true });
  });

  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage({ dbPath: TEST_PATH, dbName: 'test' });
    });

    it('should store and retrieve entries', async () => {
      await storage.initialize();
      await storage.append({
        op: 'INSERT',
        collection: 'users',
        id: '1',
        data: { name: 'Alice' },
        checksum: '',
        timestamp: Date.now()
      });

      const entries = [];
      for await (const entry of storage.readStream()) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].data).toEqual({ name: 'Alice' });
    });

    it('should clear on close', async () => {
      await storage.initialize();
      await storage.append({ op: 'INSERT', collection: 'users', id: '1', data: {}, checksum: '', timestamp: 1 });
      await storage.close();

      await storage.initialize(); // Reopen
      const entries = [];
      for await (const entry of storage.readStream()) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(0);
    });
  });

  describe('JSONStorage', () => {
    let storage: JSONStorage;
    const crypto = new CryptoManager('test-key-32-chars-long!!!');

    beforeEach(() => {
      storage = new JSONStorage({ 
        dbPath: TEST_PATH, 
        dbName: 'json-test',
        encryptionKey: 'test-key-32-chars-long!!!'
      });
    });

    it('should persist encrypted data', async () => {
      await storage.initialize();
      await storage.append({
        op: 'INSERT',
        collection: 'users',
        id: '1',
        data: { sensitive: 'credit-card-1234' },
        checksum: '',
        timestamp: Date.now()
      });
      await storage.close();

      // Reopen and verify data persists
      const newStorage = new JSONStorage({
        dbPath: TEST_PATH,
        dbName: 'json-test',
        encryptionKey: 'test-key-32-chars-long!!!'
      });
      await newStorage.initialize();

      const entries = [];
      for await (const entry of newStorage.readStream()) {
        entries.push(entry);
      }

      expect(entries[0].data.sensitive).toBe('credit-card-1234');
    });

    it('should fail with wrong key', async () => {
      await storage.initialize();
      await storage.append({ op: 'INSERT', collection: 'users', id: '1', data: { test: true }, checksum: '', timestamp: 1 });
      await storage.close();

      const wrongStorage = new JSONStorage({
        dbPath: TEST_PATH,
        dbName: 'json-test',
        encryptionKey: 'wrong-key-32-chars-long!!!'
      });
      
      // Should start fresh with warning, not crash
      await expect(wrongStorage.initialize()).resolves.not.toThrow();
    });
  });

  describe('AOLStorage', () => {
    let storage: AOLStorage;

    beforeEach(() => {
      storage = new AOLStorage({
        dbPath: TEST_PATH,
        dbName: 'aol-test',
        enableChecksums: true,
        bufferSize: 5 // Small buffer for testing
      });
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should support append-only log', async () => {
      await storage.initialize();
      
      for (let i = 0; i < 10; i++) {
        await storage.append({
          op: 'INSERT',
          collection: 'logs',
          id: String(i),
          data: { index: i },
          checksum: '',
          timestamp: Date.now()
        });
      }

      // Should flush automatically after buffer size
      const entries = [];
      for await (const entry of storage.readStream()) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(10);
    });

    it('should compact correctly', async () => {
      await storage.initialize();
      
      await storage.append({ op: 'INSERT', collection: 'items', id: '1', data: { v: 1 }, checksum: '', timestamp: 1 });
      await storage.append({ op: 'UPDATE', collection: 'items', id: '1', data: { v: 2 }, checksum: '', timestamp: 2 });
      await storage.append({ op: 'DELETE', collection: 'items', id: '1', data: {}, checksum: '', timestamp: 3 });
      await storage.append({ op: 'INSERT', collection: 'items', id: '2', data: { v: 1 }, checksum: '', timestamp: 4 });

      await storage.compact();

      const entries = [];
      for await (const entry of storage.readStream()) {
        entries.push(entry);
      }

      // After compaction, only item 2 should remain
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('2');
    });
  });
});