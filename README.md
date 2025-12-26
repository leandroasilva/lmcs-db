# lmcs-db

**Lightweight Modular Collection Storage (LMCS)** — Um micro SGBD local para Node.js focado em performance e simplicidade. Suporta coleções tipadas, índices em memória, criptografia forte e múltiplos motores de armazenamento, incluindo **Append-Only Log (AOL)** para máxima integridade e velocidade de escrita.

![npm](https://img.shields.io/npm/v/lmcs-db)
![license](https://img.shields.io/npm/l/lmcs-db)
![size](https://img.shields.io/bundlephobia/minzip/lmcs-db)

---

## ✨ Recursos

- **Múltiplos Motores de Armazenamento**:
  - **AOL (Append-Only Log)**: Escritas atômicas O(1), seguro contra falhas (Crash-Safe).
  - **Binary**: Formato binário compacto com checksum CRC32.
  - **JSON**: Legível por humanos, ideal para debug.
  - **Memory**: Volátil, para máxima performance em testes/cache.
- **🔐 Segurança**: Criptografia AES-256-CBC transparente (suporta dados criptografados em disco, legíveis na aplicação).
- **⚡ Alta Performance**: Índices em memória para consultas O(1) e escritas não-bloqueantes.
- **🔍 Consultas Poderosas**: Suporte a MongoDB-like query syntax (`$or`, `$and`, `$gt`, `$regex`, propriedades aninhadas).
- **🆔 IDs Ordenáveis**: Utiliza UUID v7 por padrão (time-ordered) para melhor performance de indexação e ordenação natural por data de criação.
- **TypeScript**: Tipagem estática completa para Coleções e Documentos.

---

## 📦 Instalação

```bash
npm install lmcs-db
# ou
yarn add lmcs-db
```

---

## 🚀 Exemplo Rápido

```typescript
import { LmcsDB } from 'lmcs-db';

interface User {
  _id: string; // Opcional (gerado auto se omitido)
  name: string;
  email: string;
  role: 'admin' | 'user';
}

async function main() {
  // 1. Inicializa o banco com Storage AOL (Mais seguro e rápido)
  const db = new LmcsDB({
    storageType: 'aol',
    databaseName: 'my-app-db',
    encryptionKey: 'super-secret-key-123' // Opcional: Criptografa tudo no disco
  });

  await db.initialize();

  // 2. Obtém uma coleção tipada
  const users = db.collection<User>('users');

  // 3. Insere dados (Escrita atômica no log)
  await users.insert({
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin'
  });

  // 4. Consulta com filtros
  const admins = await users.findAll({
    filter: { role: 'admin' }
  });

  console.log(admins);
}

main();
```

---

## 💾 Motores de Armazenamento (Storage Engines)

O `lmcs-db` oferece diferentes estratégias de persistência para atender a vários casos de uso. Escolha a que melhor se adapta ao seu projeto:

| Tipo | Descrição | Melhor Para | Performance de Escrita | Segurança (Crash) |
|------|-----------|-------------|------------------------|-------------------|
| **`aol`** | **Append-Only Log**. Adiciona operações ao final do arquivo. | Produção, Logs, Alta Frequência de Escrita. | **Ultra Rápida (O(1))** | ⭐⭐⭐⭐⭐ (Máxima) |
| **`json`** | Reescreve o arquivo JSON inteiro a cada save. | Configurações, Debug, Dados Pequenos. | Lenta (O(N)) | ⭐⭐ |
| **`binary`** | Container binário com CRC32. Reescreve o arquivo. | Dados médios que precisam de ofuscação leve. | Lenta (O(N)) | ⭐⭐⭐ |
| **`memory`** | Mantém tudo na RAM. Nada é salvo em disco. | Cache, Testes Unitários, Dados Temporários. | Instantânea | ⭐ (Volátil) |

### Usando Append-Only Log (Recomendado)

O formato AOL é o mais robusto. Em vez de reescrever todo o banco de dados a cada alteração (o que fica lento conforme o banco cresce), ele apenas anexa a nova operação (insert, update, delete) no final do arquivo.

```typescript
const db = new LmcsDB({
  storageType: 'aol',
  databaseName: 'events',
});
// As operações são persistidas instantaneamente e em ordem sequencial.
// Em caso de queda de energia, apenas a última linha pode ser perdida,
// mantendo a integridade de todo o resto.
```

---

## 🔍 Consultas e Índices

### Filtros Avançados
O sistema de busca suporta operadores complexos e navegação em objetos aninhados (Dot Notation).

```typescript
// Buscar produtos caros OU da categoria 'Tech'
const results = await products.findAll({
  filter: {
    $or: [
      { category: 'Tech' },
      { price: { $gt: 1000 } }
    ]
  }
});

// Buscar em campos aninhados
const users = await db.collection('users').findAll({
  filter: { 'address.city': 'São Paulo' }
});
```

### Índices para Performance
Crie índices em campos muito consultados para tornar as buscas instantâneas.

```typescript
// Cria índice no campo 'email' (Unique opcional)
await users.createIndex('email', { unique: true });

// A busca agora usa Hash Map (O(1)) em vez de scan linear (O(N))
const user = await users.findOne({ email: 'alice@example.com' });
```

---

## 🔐 Criptografia

O `lmcs-db` leva segurança a sério. Ao fornecer uma `encryptionKey`, os dados são criptografados **antes** de serem escritos no disco usando **AES-256-CBC**.

- No modo **JSON/Binary**: O arquivo inteiro é criptografado.
- No modo **AOL**: Os documentos sensíveis são criptografados individualmente dentro do log, mantendo a estrutura do arquivo recuperável.

```typescript
const secureDb = new LmcsDB({
  storageType: 'aol',
  databaseName: 'secure-vault',
  encryptionKey: process.env.DB_KEY // Nunca commite chaves no código!
});
```

> **Nota**: Se a chave estiver incorreta ao carregar, o banco não conseguirá descriptografar os dados e poderá iniciar vazio ou lançar erro, protegendo a informação.

---

## 📘 API Reference

### `new LmcsDB(config)`
Cria uma nova instância do banco.
- `config.storageType`: `'aol' | 'json' | 'binary' | 'memory'`
- `config.databaseName`: Nome do arquivo (sem extensão).
- `config.encryptionKey`: (Opcional) Chave para criptografia.
- `config.customPath`: (Opcional) Diretório personalizado.

### `db.collection<T>(name)`
Retorna uma referência para a coleção.

### `collection.insert(doc)`
Insere um documento. Se `_id` não for fornecido, um **UUID v7** (ordenável por tempo) será gerado automaticamente.

### `collection.find(options)` / `findAll(options)`
Busca documentos. `options` inclui `filter`, `sort`, `limit`, etc.

### `collection.update(filter, updates)`
Atualiza documentos que correspondem ao filtro.

### `collection.remove(filter)`
Remove documentos que correspondem ao filtro.

### `db.flush()`
Força a persistência de quaisquer dados pendentes em memória para o disco (útil principalmente para JSON/Binary, no AOL garante que o stream foi drenado).

### `db.compact()`
*(Disponível apenas para storage `aol`)*
Reescreve o arquivo de log, removendo entradas redundantes (updates/deletes antigos) e mantendo apenas o estado atual. Isso reduz drasticamente o tamanho do arquivo e melhora o tempo de carregamento.
Recomenda-se chamar periodicamente (ex: uma vez por dia ou após muitas operações de escrita).

```typescript
await db.compact();
```

---

## 📄 Licença

MIT © [Leandro A da Silva](https://github.com/leandroadasilva)
