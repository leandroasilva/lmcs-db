import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
  iterations: number;
  version: number;
}

export class CryptoVault {
  private derivedKey: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly VERSION = 1;
  private readonly ITERATIONS = 100000;
  private salt: string;

  constructor(password: string, existingSalt?: string) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    const saltBuffer = existingSalt 
      ? Buffer.from(existingSalt, 'hex') 
      : randomBytes(32);
    
    this.salt = saltBuffer.toString('hex');
    
    this.derivedKey = pbkdf2Sync(
      password, 
      saltBuffer, 
      this.ITERATIONS, 
      32, 
      'sha256'
    );
  }

  encrypt(data: string): EncryptedPayload {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.ALGORITHM, this.derivedKey, iv);
    
    let ciphertext = cipher.update(data, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      salt: this.salt,
      iterations: this.ITERATIONS,
      version: this.VERSION
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const key = pbkdf2Sync(
      this.derivedKey.toString('hex'),
      Buffer.from(payload.salt, 'hex'),
      payload.iterations,
      32,
      'sha256'
    );

    const decipher = createDecipheriv(
      this.ALGORITHM,
      key,
      Buffer.from(payload.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    
    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}