import { Request, Response, NextFunction } from 'express';
import pool from '../config/database.js';

// Extend Express Request interface to include authenticated user data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    nama_lengkap: string;
    divisi_role: string;
  };
}

/**
 * Middleware utama untuk memvalidasi Bearer Token dari header Authorization.
 * Migrasi dari: Motekar_ERP/backend/auth_middleware.php
 *
 * Cara kerja:
 * 1. Baca header Authorization: "Bearer <token>"
 * 2. Query users WHERE api_token = token
 * 3. Jika valid → attach req.user → next()
 * 4. Jika tidak valid → respond 401
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Header Authorization (Token) tidak ditemukan.',
    });
    return;
  }

  const match = authHeader.match(/^Bearer\s(\S+)$/);
  if (!match) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Format Authorization Header tidak valid. Gunakan format: Bearer <token>',
    });
    return;
  }

  const token = match[1];

  try {
    const [rows] = await pool.query(
      'SELECT id, username, nama_lengkap, divisi_role FROM users WHERE api_token = ?',
      [token]
    );

    const users = rows as any[];

    if (users.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Token tidak valid atau sudah expired.',
      });
      return;
    }

    // Attach user data ke request object agar bisa diakses oleh controller berikutnya
    req.user = {
      id: users[0].id,
      username: users[0].username,
      nama_lengkap: users[0].nama_lengkap,
      divisi_role: users[0].divisi_role,
    };

    next();
  } catch (error: any) {
    console.error('[AuthMiddleware] Database error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error saat memvalidasi token.',
    });
  }
};

/**
 * Middleware factory untuk membatasi akses berdasarkan role tertentu.
 * Harus digunakan SETELAH middleware `authenticate`.
 *   router.delete('/admin/users', authenticate, requireRole('IT Support', 'Owner'), deleteUser);
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Silakan login terlebih dahulu.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.divisi_role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.divisi_role}' tidak memiliki akses ke resource ini.`,
      });
      return;
    }

    next();
  };
};
