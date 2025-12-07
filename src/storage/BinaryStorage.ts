import fs from 'fs';
import path from 'path';
import { IDatabaseStorage } from '../interfaces';

class BinaryStorage implements IDatabaseStorage {
  private filePath: string;

  constructor(databaseName: string, customPath?: string) {
    const basePath = customPath ?? process.cwd();
    this.filePath = path.resolve(basePath, `${databaseName}.db`);
  }

  private xorBuffer(buffer: Buffer, key: number = 0xAA): Buffer {
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = buffer[i] ^ key;
    }
    return result;
  }

  private crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xEDB88320 & mask);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private buildFileBuffer(data: string): Buffer {
    const payload = Buffer.from(data, 'utf-8');
    const obf = this.xorBuffer(payload);
    const magic = Buffer.from('LMCSDB1');
    const flags = Buffer.from([0]);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(obf.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(this.crc32(obf), 0);
    return Buffer.concat([magic, flags, lenBuf, crcBuf, obf]);
  }

  private parseFileBuffer(buffer: Buffer): string {
    if (buffer.length < 16) return '{}';
    const magic = buffer.subarray(0, 7).toString('utf-8');
    if (magic !== 'LMCSDB1') return '{}';
    const len = buffer.readUInt32BE(8);
    const crc = buffer.readUInt32BE(12);
    const start = 16;
    const end = start + len;
    if (end > buffer.length) return '{}';
    const obf = buffer.subarray(start, end);
    if (this.crc32(obf) !== crc) return '{}';
    const payload = this.xorBuffer(obf);
    return payload.toString('utf-8');
  }

  async save(data: string): Promise<void> {
    const buf = this.buildFileBuffer(data);
    await fs.promises.writeFile(this.filePath, buf);
  }

  async load(): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(this.filePath);
      return this.parseFileBuffer(buffer);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '{}';
      }
      throw error;
    }
  }
}

export default BinaryStorage;