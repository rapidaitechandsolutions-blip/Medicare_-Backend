export class AppError extends Error {
  statusCode: number;
  details?: unknown; // Changed from `any` for better type safety

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Ensure `name` property is set to the class name
    this.name = this.constructor.name;

    // Use type assertion to access Node.js-specific captureStackTrace
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, this.constructor);
    } else {
      // Fallback to ensure stack trace is captured if captureStackTrace is unavailable
      this.stack = new Error(message).stack;
    }
  }
}
