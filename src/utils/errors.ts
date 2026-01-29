export class LMCSError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends LMCSError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class CorruptionError extends LMCSError {
  constructor(message: string) {
    super(message, 'DATA_CORRUPTION');
  }
}

export class ConcurrencyError extends LMCSError {
  constructor(message: string) {
    super(message, 'CONCURRENCY_ERROR');
  }
}

export class TransactionError extends LMCSError {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR');
  }
}