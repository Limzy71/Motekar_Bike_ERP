import jwt from 'jsonwebtoken';
/**
 * Middleware utama untuk memvalidasi JWT Bearer Token.
 */
export const authenticate = async (req, res, next) => {
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            id: decoded.id,
            username: decoded.username,
            nama_lengkap: decoded.nama_lengkap,
            divisi_role: decoded.divisi_role,
        };
        next();
    }
    catch (error) {
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
export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
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
