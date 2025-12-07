type WriteFn = (data: string) => Promise<void>;

class AsyncWriteWorker {
  private writing = false;
  private pendingPayload?: string;
  private resolveIdle?: () => void;
  private writeFn: WriteFn;

  constructor(writeFn: WriteFn) {
    this.writeFn = writeFn;
  }

  enqueue(data: string): void {
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
      await this.writeFn(payload!);
    } finally {
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
}

export default AsyncWriteWorker;