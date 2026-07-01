import { Response } from 'express';
import pool from '../config/database.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

/**
 * GET /api/dashboard
 * Mengembalikan data KPI dan Chart untuk halaman Dashboard.
 * Migrasi dari: Motekar_ERP/backend/get_dashboard.php
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     kpi: { total_pr, total_invoice, job_selesai, stok_komponen },
 *     charts: { kanban_status: [...], stok_kategori: [...] }
 *   }
 * }
 */
export const getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Struktur response default
    const response = {
      kpi: {
        total_pr: 0,
        total_invoice: 0,
        job_selesai: 0,
        stok_komponen: 0,
      },
      charts: {
        kanban_status: [] as { label: string; data: number }[],
        stok_kategori: [] as { label: string; data: number }[],
      },
    };

    // === KPI 1: Total PR Aktif ===
    const [prRows] = await pool.query('SELECT COUNT(*) as total FROM pengadaan_pr_header');
    const prData = prRows as any[];
    if (prData.length > 0) {
      response.kpi.total_pr = Number(prData[0].total) || 0;
    }

    // === KPI 2: Total Invoice ===
    const [invRows] = await pool.query('SELECT COUNT(*) as total FROM penjualan_invoice');
    const invData = invRows as any[];
    if (invData.length > 0) {
      response.kpi.total_invoice = Number(invData[0].total) || 0;
    }

    // === KPI 3: Job Selesai ===
    const [jobRows] = await pool.query(
      "SELECT COUNT(*) as total FROM operasi_kanban WHERE status_kolom = 'selesai'"
    );
    const jobData = jobRows as any[];
    if (jobData.length > 0) {
      response.kpi.job_selesai = Number(jobData[0].total) || 0;
    }

    // === KPI 4: Stok Komponen ===
    const [stokRows] = await pool.query(
      "SELECT SUM(jumlah_stok) as total FROM inventory_stok WHERE kategori = 'Komponen'"
    );
    const stokData = stokRows as any[];
    if (stokData.length > 0) {
      response.kpi.stok_komponen = Number(stokData[0].total) || 0;
    }

    // === Chart 1: Distribusi Status Kanban (Bar Chart) ===
    const [kanbanRows] = await pool.query(
      'SELECT status_kolom, COUNT(*) as jumlah FROM operasi_kanban GROUP BY status_kolom'
    );
    const kanbanData = kanbanRows as any[];
    kanbanData.forEach((row) => {
      response.charts.kanban_status.push({
        label: row.status_kolom
          ? row.status_kolom.charAt(0).toUpperCase() + row.status_kolom.slice(1)
          : 'Unknown',
        data: Number(row.jumlah) || 0,
      });
    });

    // === Chart 2: Proporsi Stok per Kategori (Doughnut Chart) ===
    const [stokKatRows] = await pool.query(
      'SELECT kategori, SUM(jumlah_stok) as total FROM inventory_stok GROUP BY kategori'
    );
    const stokKatData = stokKatRows as any[];
    stokKatData.forEach((row) => {
      response.charts.stok_kategori.push({
        label: row.kategori || 'Lainnya',
        data: Number(row.total) || 0,
      });
    });

    res.json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error('[DashboardController] Error:', error.message);
    res.status(500).json({
      success: false,
      message: `Gagal memuat data dashboard: ${error.message}`,
    });
  }
};

export const getExecutiveMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const queryAsset = `SELECT SUM(jumlah_stok * harga_standar) as total_valuasi FROM inventory_stok`;
    
    // Using created_at for operasi_wo_header since tanggal_dibuat doesn't exist
    const queryProduction = `
      SELECT status, COUNT(*) as count 
      FROM operasi_wo_header 
      WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) 
        AND YEAR(created_at) = YEAR(CURRENT_DATE())
      GROUP BY status
    `;

    const querySales = `
      SELECT SUM(total_nilai) as total_pendapatan 
      FROM penjualan_so_header 
      WHERE status_so IN ('DELIVERED', 'COMPLETED')
    `;

    // aftersales_klaim uses status_klaim with 'SUBMITTED', 'IN_INSPECTION'
    const queryAftersales = `
      SELECT COUNT(*) as total_klaim 
      FROM aftersales_klaim 
      WHERE status_klaim IN ('SUBMITTED', 'IN_INSPECTION')
    `;

    // Run queries in parallel
    const [
      [assetResult],
      [productionResult],
      [salesResult],
      [aftersalesResult]
    ] = await Promise.all([
      pool.query(queryAsset),
      pool.query(queryProduction),
      pool.query(querySales),
      pool.query(queryAftersales)
    ]) as any;

    // Format Asset Valuation
    const totalAssetValuation = parseFloat(assetResult[0]?.total_valuasi || 0);

    // Format Production Health
    let completedWO = 0;
    let inProgressWO = 0;
    productionResult.forEach((row: any) => {
      if (row.status === 'COMPLETED') completedWO = row.count;
      else if (['IN_PROGRESS', 'KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC'].includes(row.status)) {
        inProgressWO += row.count; // Grouping all active progress statuses
      }
    });

    // Format Sales Performance
    const totalSalesRevenue = parseFloat(salesResult[0]?.total_pendapatan || 0);

    // Format Aftersales Load
    const totalPendingClaims = aftersalesResult[0]?.total_klaim || 0;

    res.json({
      success: true,
      data: {
        asset_valuation: totalAssetValuation,
        production_health: {
          completed: completedWO,
          in_progress: inProgressWO
        },
        sales_revenue: totalSalesRevenue,
        aftersales_claims: totalPendingClaims
      }
    });

  } catch (error: any) {
    console.error('[getExecutiveMetrics] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};
