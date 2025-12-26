# lmcs-db

**Lightweight Modular Collection Storage (LMCS)** — um micro SGBD baseado em arquivos locais, com suporte a coleções tipadas, filtros avançados e criptografia opcional.

![npm](https://img.shields.io/npm/v/lmcs-db)

---

## ✨ Recursos

- 📦 Armazenamento em JSON ou binário  
- 🔐 Suporte a criptografia AES opcional  
- 🔍 Consultas com filtros avançados ($or, $and, aninhados)
- ⚡ Índices em memória para alta performance
- 💾 Persistência assíncrona otimizada (non-blocking)
- 🧩 Coleções tipadas com suporte a `_id`  
- 🧾 Formato binário com cabeçalho, tamanho e CRC32 (container estilo SQLite)  
- 🚀 Auto-criação de diretórios ao salvar

---


```bash
npm install lmcs-db
# ou
yarn add lmcs-db

🚀 Exemplo de uso
import { DatabaseFactory, DatabaseStorageType } from 'lmcs-db';

interface User {
  _id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
}

async function main() {
  const db = await DatabaseFactory.create({
    storageType: DatabaseStorageType.Binary,
    databaseName: 'secure-db',
    customPath: `${process.cwd()}/data`,
    encryptionKey: 'my-secret-key-123'
  });

  const users = db.collection<User>('users');

  await users.insert({
    name: 'Alice',
    email: 'alice@example.com',
    age: 30,
    active: true
  });

  const activeUsers = await users.findAll({
    filter: { active: true }
  });

  console.log(activeUsers);
}

main();
```

### ⚡ Performance e Índices

O LMCS-DB suporta índices em memória para otimizar consultas de igualdade.

```ts
// Criar um índice para o campo 'category'
await products.createIndex('category');

// Consultas filtrando por 'category' agora são O(1) (instantâneas)
const results = await products.findAll({
  filter: { category: 'Electronics' }
});
```

### 🔍 Filtros Avançados

Suporte para operadores lógicos e acesso a propriedades aninhadas (dot notation).

```ts
// Operadores $or e $and
const results = await products.findAll({
  filter: {
    $or: [
      { category: 'Books' },
      { price: { $gt: 100 } }
    ]
  }
});

// Propriedades aninhadas
const users = await db.collection('users').findAll({
  filter: { 'address.city': 'New York' }
});
```

### Encerramento
```ts
import { DatabaseFactory, DatabaseStorageType } from 'lmcs-db';

async function main() {
  const db = await DatabaseFactory.create({
    storageType: DatabaseStorageType.Binary,
    databaseName: 'secure-db',
    customPath: `${process.cwd()}/data`
  });

  await db.collection('users').insert({ _id: '1', name: 'Alice' });

  await db.flush();
}

main();
```

## 📘 API
 - DatabaseFactory.create(options): Cria uma instância do banco de dados.

Parâmetros:
 - `storageType`: `Memory` | `Json` | `Binary` — Define o formato de armazenamento
 - `databaseName`: string — Nome do arquivo base do banco
 - `encryptionKey`: string (opcional) — Chave usada para criptografia AES
 - `customPath`: string (opcional) — Diretório onde será criado o arquivo de armazenamento (criado automaticamente se não existir)

db.collection<T>(name)
Obtém uma coleção tipada com suporte a:
- insert
- find
- findAll (com suporte a índices e filtros complexos)
- update
- delete
- count
- createIndex(field, options?)

entre outros métodos utilitários

📂 Estrutura esperada
Os dados são armazenados em um único arquivo `.db`, conforme o tipo de armazenamento escolhido.
As escritas são enfileiradas e processadas de forma sequencial, sem bloquear as operações do banco; chame `db.save()` para solicitar flush imediato quando necessário.
O diretório de destino é criado automaticamente durante a gravação.

🔒 Criptografia
O sistema utiliza o algoritmo AES-256-CBC com vetor de inicialização (IV) dinâmico.
Se um banco for carregado com uma chave incorreta, ele será reiniciado como vazio, com um aviso exibido no console.

Formato binário
O arquivo `.db` usa um contêiner com cabeçalho: `LMCSDB1` (magic), `flags`, `payloadLength` e `CRC32`. O payload (JSON, possivelmente criptografado) é ofuscado com XOR.
Na leitura, o cabeçalho e o CRC são validados; dados inválidos retornam `'{}'` de forma segura.

✅ Testes
Para executar os testes de demonstração:

📄 Licença
MIT

✍️ Autor
Desenvolvido por Leandro A da Silva.
