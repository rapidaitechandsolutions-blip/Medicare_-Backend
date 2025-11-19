export class AppError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// utils/validators.ts
export function isValidISODate(date: string): boolean {
  return !isNaN(Date.parse(date));
}
