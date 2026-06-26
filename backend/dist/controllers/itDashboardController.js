import pool from '../config/database.js';
export const getITDashboardStats = async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT COUNT(*) as total_users FROM users WHERE status = "Aktif"');
        const totalUsers = userRows[0].total_users;
        const [auditRows] = await pool.query('SELECT COUNT(*) as total_login FROM audit_logs WHERE action LIKE "%login%" AND created_at >= NOW() - INTERVAL 24 HOUR');
        const totalLogin = auditRows[0].total_login;
        res.json({
            success: true,
            data: {
                active_users: totalUsers,
                login_sessions_24h: totalLogin,
                db_status: 'Connected'
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
