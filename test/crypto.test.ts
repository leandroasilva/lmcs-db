import { describe, it, expect } from '@jest/globals';
import { CryptoManager } from '../src/crypto/manager';

describe('CryptoManager', () => {
  it('should encrypt and decrypt', () => {
    const crypto = new CryptoManager('my-secret-key-32-chars!!!');
    const sensitive = 'credit-card: 4532-1234-5678-9012';

    const encrypted = crypto.encrypt(sensitive);
    expect(encrypted.data).not.toBe(sensitive);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = crypto.decrypt(encrypted);
    expect(decrypted).toBe(sensitive);
  });

  it('should fail with wrong key', () => {
    const crypto1 = new CryptoManager('correct-key-32-chars!!!');
    const crypto2 = new CryptoManager('wrong-key-32-chars!!!!');

    const encrypted = crypto1.encrypt('secret');

    expect(() => {
      crypto2.decrypt(encrypted);
    }).toThrow();
  });

  it('should generate consistent hashes', () => {
    const hash1 = CryptoManager.hash('test-data');
    const hash2 = CryptoManager.hash('test-data');
    const hash3 = CryptoManager.hash('other-data');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});