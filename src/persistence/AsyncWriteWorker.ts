type WriteFn = (data: string) => Promise<void>;

class AsyncWriteWorker {
  private writing = false;
  private pendingPayload?: string;
  private resolveIdle?: () => void;
  private writeFn: WriteFn;
  private enqueuedCount = 0;
  private writesCount = 0;
  private lastDurationMs = 0;
  private lastBytes = 0;
  private totalBytes = 0;
  private lastStartedAt?: number;
  private lastFinishedAt?: number;

  constructor(writeFn: WriteFn) {
    this.writeFn = writeFn;
  }

  enqueue(data: string): void {
    this.enqueuedCount += 1;
    this.pendingPayload = data;
    if (!this.writing) {
      this.process();
    }
  }

  private async process(): Promise<void> {
    if (!this.pendingPayload) return;
    this.writing = true;
    const payload = this.pendingPayload;
    this.pendingPayload = undefined;
    try {
      this.lastStartedAt = Date.now();
      this.lastBytes = Buffer.byteLength(payload!, 'utf-8');
      await this.writeFn(payload!);
    } finally {
      this.lastFinishedAt = Date.now();
      this.lastDurationMs = (this.lastFinishedAt - (this.lastStartedAt || this.lastFinishedAt));
      this.writesCount += 1;
      this.totalBytes += this.lastBytes;
      this.writing = false;
      if (this.pendingPayload) {
        setImmediate(() => this.process());
      } else if (this.resolveIdle) {
        const fn = this.resolveIdle;
        this.resolveIdle = undefined;
        fn();
      }
    }
  }

  async flush(): Promise<void> {
    if (this.writing || this.pendingPayload) {
      await new Promise<void>((resolve) => {
        this.resolveIdle = resolve;
        if (!this.writing && this.pendingPayload) {
          this.process();
        }
      });
    }
  }

  getStats() {
    return {
      enqueuedCount: this.enqueuedCount,
      writesCount: this.writesCount,
      inFlight: this.writing,
      hasPending: !!this.pendingPayload,
      lastDurationMs: this.lastDurationMs,
      lastBytes: this.lastBytes,
      totalBytes: this.totalBytes,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt
    };
  }
}

export default AsyncWriteWorker;
