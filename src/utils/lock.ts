import * as lockfile from 'proper-lockfile';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';

export class FileLocker {
  private locks = new Map<string, () => Promise<void>>();

  async acquire(filePath: string, options?: { retries?: number; stale?: number }): Promise<void> {
    // Garante que o diretório existe
    await mkdir(dirname(filePath), { recursive: true });
    
    const release = await lockfile.lock(filePath, {
      retries: options?.retries ?? 5,
      stale: options?.stale ?? 5000,
      updateInterval: 2000
    });
    
    this.locks.set(filePath, release);
  }

  async release(filePath: string): Promise<void> {
    const release = this.locks.get(filePath);
    if (release) {
      await release();
      this.locks.delete(filePath);
    }
  }

  async withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(filePath);
    try {
      return await fn();
    } finally {
      await this.release(filePath);
    }
  }

  async releaseAll(): Promise<void> {
    const promises = Array.from(this.locks.entries()).map(async ([path, release]) => {
      try {
        await release();
      } catch (e) {
        console.warn(`Failed to release lock for ${path}:`, e);
      }
    });
    
    await Promise.all(promises);
    this.locks.clear();
  }
}