// Subspec B — Slice b-0.5: Error classes

export class ExportError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = 'ExportError';
  }
}

export class NbtSafetyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'NbtSafetyError';
  }
}
