import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
 * Middleware utama untuk memvalidasi JWT Bearer Token.
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

    req.user = {
      id: decoded.id,
      username: decoded.username,
      nama_lengkap: decoded.nama_lengkap,
      divisi_role: decoded.divisi_role,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Token expired atau tidak valid.',
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
