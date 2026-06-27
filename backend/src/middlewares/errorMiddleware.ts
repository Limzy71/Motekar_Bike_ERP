import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific database errors
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Data yang Anda masukkan sudah ada (Duplikat).';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 400;
    message = 'Data tidak bisa dihapus karena sedang digunakan oleh data lain.';
  }

  // Format standard response
  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
