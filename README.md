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

```bash
npm install lmcs-db
```

```typescript
import { Database, StorageType } from "lmcs-db";

interface User {
  _id?: string;
  name: string;
  email: string;
  age: number;
}

// Create database
const db = await Database.create({
  storageType: "binary",
  databaseName: "myapp",
  encryptionKey: "your-secret-key-32-chars!!", // Optional
});

const users = db.collection<User>("users");

// Insert
await users.insert({ name: "Alice", email: "alice@test.com", age: 30 });

// Query
const adults = await users.findAll({
  filter: { age: { $gte: 18 } },
  sort: { name: 1 },
  limit: 10,
});

// Transaction
await db.transaction(async (trx) => {
  await trx.insert("users", { name: "Bob", age: 25 });
  await trx.update("users", "alice-id", { age: 31 });
});
```

💾 Storage Engines
| Engine | Persistence | Speed | Use Case | Compression |
| ---------- | ----------- | ------------- | ------------------------------------- | -------------- |
| **Memory** | ❌ Volatile | ⚡ Ultra-fast | Cache, testing, temporary data | N/A |
| **JSON** | ✅ File | 🐢 Moderate | Config files, small datasets (<10MB) | None (text) |
| **Binary** | ✅ File | 🚀 Fast | General purpose, medium datasets | Binary packing |
| **AOL** | ✅ File | ⚡ Fast writes | Logs, event sourcing, high throughput | Compaction |

Engine Details

Memory Storage

```typescript
const db = await createDatabase({
  storageType: "memory",
  databaseName: "cache",
});
// Data lost on process exit. Fastest option.
```

JSON Storage

```typescript
const db = await createDatabase({
  storageType: "json",
  databaseName: "config",
});
// Human-readable, but slower than binary.
```

Binary Storage

```typescript
const db = await createDatabase({
  storageType: "binary",
  databaseName: "data",
  encryptionKey: "secret", // Optional encryption
});
// Compact binary format with CRC32 checksums
```

AOL (Append-Only Log)

```typescript
const db = await Database.create({
  storageType: "aol",
  databaseName: "events",
  bufferSize: 1000, // Buffer before fsync
  compactionInterval: 60000, // Automatic cleanup every 60s
});
// O(1) writes, perfect for event sourcing
```

🔍 Query API

Basic Queries

```typescript
// Find one
const user = await users.findOne({ email: "alice@test.com" });

// Find all
const all = await users.findAll();

// Count
const total = await users.count();
```

Advanced Filtering

```typescript
// Comparison operators
const adults = await users.findAll({ filter: { age: { $gte: 18 } } });
const rich = await users.findAll({ filter: { salary: { $gt: 100000 } } });

// Logical operators
const result = await users.findAll({
  filter: {
    $or: [{ age: { $lt: 18 } }, { vip: true }],
  },
});

// Array operators (if field is array)
const tagged = await posts.findAll({
  filter: { tags: { $in: ["typescript", "nodejs"] } },
});
```

Sorting and Pagination

```typescript
const page = await users.findAll({
  filter: { active: true },
  sort: { createdAt: -1 }, // -1 = descending, 1 = ascending
  skip: 20, // Offset
  limit: 10, // Page size
});
```

Streaming (Memory Efficient)

```typescript
// Process millions of records without loading into memory
const stream = logs.findStream({ filter: { level: "error" } });

for await (const error of stream) {
  await sendAlert(error);
}
```

🔄 Transactions
ACID transactions ensure data consistency across multiple operations:

```typescript
await db.transaction(async (trx) => {
  // All operations succeed or all rollback
  const order = await trx.insert("orders", { total: 100, status: "pending" });
  await trx.insert("order_items", { orderId: order._id, product: "Laptop" });
  await trx.update("inventory", "laptop-123", { stock: { $dec: 1 } });

  if (somethingWrong) {
    throw new Error("Rollback everything");
  }
});
```

🔐 Security
Encryption
Algorithm: AES-256-GCM
Key Derivation: PBKDF2 with 100,000 iterations
Unique IV per encryption operation
Authentication tag prevents tampering

```typescript
const db = await Database.create({
  storageType: "binary",
  databaseName: "secrets",
  encryptionKey: process.env.DB_KEY, // Load from secure source
});

// All data transparently encrypted on disk
await secrets.insert({ password: "super-secret" });
```

Indexing
Create indexes for fast queries:

```typescript
// Single field
users.createIndex("email", { unique: true });

// Compound
orders.createIndex(["userId", "createdAt"]);

// Sparse (skip null values)
users.createIndex("phone", { sparse: true });
```
📊 Performance Tips
1. Use Memory storage for unit tests (10x faster)
2. Batch inserts instead of individual awaits
3. Create indexes on frequently queried fields
4. Use streaming for large datasets (>10k records)
5. Compact AOL periodically to reclaim space
6. Enable checksums for critical data integrity

```typescript
// Batch insert (much faster)
await Promise.all(
  items.map(item => collection.insert(item))
);

// Compact AOL storage
await db.compact();
```

🧪 Testing
```bash
# Run all tests
npm test

# Run specific suite
npm test -- storage.test.ts

# With coverage
npm run test:coverage
```

📁 Project Structure
```bash
data/
├── myapp.bin        # Binary storage file
├── myapp.json       # JSON storage file
└── myapp.aol        # Append-only log

src/
├── core/
│   ├── database.ts      # Main database class
│   ├── collection.ts    # Collection operations
│   ├── transaction.ts   # ACID transactions
│   └── indexer.ts       # Index management
├── storage/
│   ├── base.ts          # Storage interface
│   ├── memory.ts        # In-memory storage
│   ├── json.ts          # JSON file storage
│   ├── binary.ts        # Binary storage
│   └── aol.ts           # Append-only log
└── crypto/
    └── manager.ts       # Encryption utilities
```

🤝 Contributing
1. Fork the repository
2. Create your feature branch (git checkout -b feature/amazing)
3. Commit changes (git commit -m 'Add amazing feature')
4. Push to branch (git push origin feature/amazing)
5. Open a Pull Request

📄 License
[MIT License](LICENSE) - see [LICENSE](LICENSE) file.

Made with ❤️ by Leandro A. da Silva