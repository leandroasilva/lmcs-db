import * as lockfile from 'proper-lockfile';

export class FileLocker {
  private locks = new Map<string, () => Promise<void>>();

  async acquire(filePath: string, options?: { retries?: number }): Promise<void> {
    const release = await lockfile.lock(filePath, {
      retries: options?.retries ?? 5,
      stale: 5000,
      realpath: false
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
}