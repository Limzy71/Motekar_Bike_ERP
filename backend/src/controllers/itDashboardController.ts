import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getITDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [userRows]: any = await pool.query('SELECT COUNT(*) as total_users FROM users WHERE status = "Aktif"');
    const totalUsers = userRows[0].total_users;

    const [auditRows]: any = await pool.query(
      'SELECT COUNT(*) as total_login FROM audit_logs WHERE action LIKE "%login%" AND created_at >= NOW() - INTERVAL 24 HOUR'
    );
    const totalLogin = auditRows[0].total_login;

    res.json({
      success: true,
      data: {
        active_users: totalUsers,
        login_sessions_24h: totalLogin,
        db_status: 'Connected'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
