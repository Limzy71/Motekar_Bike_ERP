import pool from '../config/database.js';

/**
 * Helper: Mencatat log tindakan krusial ke tabel audit_logs.
 * @param userId ID user yang melakukan tindakan
 * @param action Deskripsi singkat tindakan
 * @param ip IP Address dari request
 * @param status Status keberhasilan ('Success' | 'Failed' | 'Warning')
 */
export const logAudit = async (
  userId: number,
  action: string,
  ip: string = '127.0.0.1',
  status: 'Success' | 'Failed' | 'Warning' = 'Success'
): Promise<void> => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, status) VALUES (?, ?, ?, ?)',
      [userId, action, ip, status]
    );
  } catch (error) {
    console.error('[logAudit] Gagal mencatat log:', error);
  }
};
