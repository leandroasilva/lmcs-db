# LMCS-DB v2.0

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-18+-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Lightweight Modular Collection Storage** — A high-performance, file-based NoSQL database for Node.js with multiple storage engines, ACID transactions, and military-grade encryption.

## ✨ Features

- **🗄️ Multiple Storage Engines**: Memory, JSON, Binary, and Append-Only Log (AOL)
- **🔐 Built-in Encryption**: AES-256-GCM with PBKDF2 key derivation
- **🔄 ACID Transactions**: Multi-document transactions with rollback support
- **⚡ High Performance**: In-memory indexes, streaming queries, and batch operations
- **🔍 Advanced Queries**: MongoDB-like operators ($gt, $lt, $or, $and, $in)
- **📦 Zero Dependencies**: Lightweight with minimal footprint
- **🧪 Full TypeScript**: Type-safe collections with IntelliSense support

## 🚀 Quick Start

````bash
npm install lmcs-db
````

````code
import { Database, StorageType } from 'lmcs-db';

interface User {
  _id?: string;
  name: string;
  email: string;
  age: number;
}

// Create database
const db = await Database.create({
  storageType: StorageType.Binary,
  databaseName: 'myapp',
  encryptionKey: 'your-secret-key-32-chars!!' // Optional
});

const users = db.collection<User>('users');

// Insert
await users.insert({ name: 'Alice', email: 'alice@test.com', age: 30 });

// Query
const adults = await users.findAll({
  filter: { age: { $gte: 18 } },
  sort: { name: 1 },
  limit: 10
});

// Transaction
await db.transaction(async (trx) => {
  await trx.insert('users', { name: 'Bob', age: 25 });
  await trx.update('users', 'alice-id', { age: 31 });
});
````
