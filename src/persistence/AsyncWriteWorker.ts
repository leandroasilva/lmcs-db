type TaskFn = () => Promise<void>;

class AsyncWriteWorker {
  private writing = false;
  private hasPending = false;
  private resolveIdle?: () => void;
  private taskFn: TaskFn;
  private enqueuedCount = 0;
  private writesCount = 0;
  private lastDurationMs = 0;
  private lastStartedAt?: number;
  private lastFinishedAt?: number;

  constructor(taskFn: TaskFn) {
    this.taskFn = taskFn;
  }

  trigger(): void {
    this.enqueuedCount += 1;
    this.hasPending = true;
    if (!this.writing) {
      this.process();
    }
  }

  private async process(): Promise<void> {
    if (!this.hasPending) return;
    
    this.writing = true;
    // We clear pending flag BEFORE execution. 
    // If a new trigger comes during execution, it sets hasPending=true again, 
    // causing a re-run after this one finishes.
    this.hasPending = false;
    
    try {
      this.lastStartedAt = Date.now();
      await this.taskFn();
    } finally {
      this.lastFinishedAt = Date.now();
      this.lastDurationMs = (this.lastFinishedAt - (this.lastStartedAt || this.lastFinishedAt));
      this.writesCount += 1;
      this.writing = false;
      
      if (this.hasPending) {
        setImmediate(() => this.process());
      } else if (this.resolveIdle) {
        const fn = this.resolveIdle;
        this.resolveIdle = undefined;
        fn();
      }
    }
  }

  async flush(): Promise<void> {
    if (this.writing || this.hasPending) {
      await new Promise<void>((resolve) => {
        this.resolveIdle = resolve;
        if (!this.writing && this.hasPending) {
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
      hasPending: this.hasPending,
      lastDurationMs: this.lastDurationMs,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt
    };
  }
}

export default AsyncWriteWorker;
