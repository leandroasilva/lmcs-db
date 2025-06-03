import crypto from 'crypto';

class EncryptionService {
  private algorithm = 'aes-256-cbc';
  private key: Buffer;
  private iv: Buffer;

  constructor(encryptionKey: string) {
    // Derive a 32-byte key using SHA-256
    this.key = crypto.createHash('sha256').update(encryptionKey).digest();
    // Generate a random 16-byte IV
    this.iv = crypto.randomBytes(16);
  }

  encrypt(data: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return `${this.iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(encryptedData: string): string {
    const [iv, data] = encryptedData.split(':');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, Buffer.from(iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]);
    return decrypted.toString();
  }
}

export default EncryptionService;