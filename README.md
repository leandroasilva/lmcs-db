# lmcs-db

**Lightweight Modular Collection Storage (LMCS)** — um micro SGBD baseado em arquivos locais, com suporte a coleções tipadas, filtros avançados e criptografia opcional.

![npm](https://img.shields.io/npm/v/lmcs-db)

---

## ✨ Recursos

- 📦 Armazenamento em JSON ou binário  
- 🔐 Suporte a criptografia AES opcional  
- 🔍 Consultas com filtros e ordenação  
- 💾 Persistência simples baseada em arquivos  
- 🧩 Coleções tipadas com suporte a `_id`  
- 🔄 Operações CRUD com sintaxe assíncrona  

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


## 📘 API
 - DatabaseFactory.create(options): Cria uma instância do banco de dados.

Parâmetros:
 - storageType: Memory, Json ou Binary para	Define o formato de armazenamento
 - databaseName:	string	Nome do arquivo base do banco
 - encryptionKey:	string (opcional)	Chave usada para criptografia AES
 - customPath: string (opcional) Path de onde será criado o arquivo de armazenamento

db.collection<T>(name)
Obtém uma coleção tipada com suporte a:
- insert
- find
- findAll
- update
- delete
- count

entre outros métodos utilitários

📂 Estrutura esperada
Os dados são armazenados em um único arquivo .db, conforme o tipo de armazenamento escolhido.
A persistência é automática após alterações, garantindo integridade dos dados em disco.

🔒 Criptografia
O sistema utiliza o algoritmo AES-256-CBC com vetor de inicialização (IV) dinâmico.
Se um banco for carregado com uma chave incorreta, ele será reiniciado como vazio, com um aviso exibido no console.

O fornato binário do arquivo é ofuscado usando xorBuffer para que mesmo que não esteja usando criptografia o arquivo não legivel a humanos e tenha um desenpenho melhor para arquivos maiores.

✅ Testes
Para executar os testes de demonstração:

📄 Licença
MIT

✍️ Autor
Desenvolvido por Leandro A da Silva.