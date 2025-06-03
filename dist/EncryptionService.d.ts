declare class EncryptionService {
    private algorithm;
    private key;
    private iv;
    constructor(encryptionKey: string);
    encrypt(data: string): string;
    decrypt(encryptedData: string): string;
}
export default EncryptionService;
