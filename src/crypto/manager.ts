import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto';

export interface EncryptedData {
  data: string;  // hex encoded
  iv: string;    // hex encoded
  tag: string;   // hex encoded (GCM auth tag)
  salt: string;  // hex encoded
  version: number;
}

export class CryptoManager {
  private masterKey?: Buffer;
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly ITERATIONS = 100000;
  private static readonly KEYLEN = 32;
  private static readonly VERSION = 1;

  constructor(password?: string) {
    if (password) {
      // Derivação inicial - salt aleatório gerado aqui
      const salt = randomBytes(32);
      this.masterKey = this.deriveKey(password, salt);
      (this as any)._salt = salt.toString('hex'); // Guarda para referência
    }
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, CryptoManager.ITERATIONS, CryptoManager.KEYLEN, 'sha256');
  }

  encrypt(text: string): EncryptedData {
    if (!this.masterKey) throw new Error('CryptoManager not initialized with password');
    
    const iv = randomBytes(16);
    const cipher = createCipheriv(CryptoManager.ALGORITHM, this.masterKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      data: encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      salt: (this as any)._salt,
      version: CryptoManager.VERSION
    };
  }

  decrypt(encrypted: EncryptedData): string {
    if (!this.masterKey) throw new Error('CryptoManager not initialized with password');
    
    const decipher = createDecipheriv(
      CryptoManager.ALGORITHM,
      this.masterKey,
      Buffer.from(encrypted.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    
    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Valida se a chave fornecida pode descriptografar os dados existentes
  async validateKey(testData?: EncryptedData): Promise<boolean> {
    if (!this.masterKey || !testData) return false;
    try {
      this.decrypt(testData);
      return true;
    } catch {
      return false;
    }
  }

  static hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}