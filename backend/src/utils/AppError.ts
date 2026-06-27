export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    
    // Memastikan stack trace di-capture dengan benar di V8
    Error.captureStackTrace(this, this.constructor);
  }
}
