import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Controller untuk Modul Pemasaran B2B (CRM & Campaign Management).
 */

// ============================================================
// CAMPAIGNS
// ============================================================

// [GET] /api/pemasaran/campaigns
export const getAllCampaigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id_campaign, nama_campaign, jenis, budget_alokasi, status, lokasi, DATE_FORMAT(tanggal_mulai, "%Y-%m-%d") as tanggal_mulai, DATE_FORMAT(tanggal_selesai, "%Y-%m-%d") as tanggal_selesai, created_at FROM pemasaran_campaigns ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[getAllCampaigns] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// [POST] /api/pemasaran/campaigns
export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nama_campaign, jenis, budget_alokasi, tanggal_mulai, tanggal_selesai, lokasi } = req.body;

    if (!nama_campaign || !jenis || budget_alokasi === undefined) {
      res.status(400).json({ success: false, message: 'Mohon lengkapi seluruh field Kampanye.' });
      return;
    }

    await pool.query(
      'INSERT INTO pemasaran_campaigns (nama_campaign, jenis, budget_alokasi, tanggal_mulai, tanggal_selesai, lokasi) VALUES (?, ?, ?, ?, ?, ?)',
      [nama_campaign.trim(), jenis, parseFloat(budget_alokasi), tanggal_mulai || null, tanggal_selesai || null, lokasi || ""]
    );

    res.status(201).json({ success: true, message: 'Kampanye baru berhasil dibuat.' });
  } catch (error: any) {
    console.error('[createCampaign] Error:', error);
    res.status(500).json({ success: false, message: `Gagal membuat kampanye: ${error.message}` });
  }
};

// [PATCH] /api/pemasaran/campaigns/:id
export const updateCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nama_campaign, jenis, budget_alokasi, status, tanggal_mulai, tanggal_selesai, lokasi } = req.body;
    
    await pool.query(
      'UPDATE pemasaran_campaigns SET nama_campaign = ?, jenis = ?, budget_alokasi = ?, status = ?, tanggal_mulai = ?, tanggal_selesai = ?, lokasi = ? WHERE id_campaign = ?',
      [nama_campaign?.trim(), jenis, parseFloat(budget_alokasi), status, tanggal_mulai || null, tanggal_selesai || null, lokasi || "", id]
    );

    res.json({ success: true, message: 'Kampanye berhasil diperbarui.' });
  } catch (error: any) {
    console.error('[updateCampaign] Error:', error);
    res.status(500).json({ success: false, message: `Gagal update kampanye: ${error.message}` });
  }
};

// [DELETE] /api/pemasaran/campaigns/:id
export const deleteCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Validasi Orphan Data: Apakah kampanye ini sudah dipakai oleh Lead?
    const [leads]: any = await pool.query('SELECT COUNT(*) as count FROM pemasaran_leads WHERE id_campaign = ?', [id]);
    if (leads[0].count > 0) {
      res.status(400).json({ success: false, message: 'Tidak dapat menghapus kampanye karena sudah ada prospek/lead yang menggunakan kampanye ini.' });
      return;
    }

    await pool.query('DELETE FROM pemasaran_campaigns WHERE id_campaign = ?', [id]);
    res.json({ success: true, message: 'Kampanye berhasil dihapus secara permanen.' });
  } catch (error: any) {
    console.error('[deleteCampaign] Error:', error);
    res.status(500).json({ success: false, message: `Gagal hapus kampanye: ${error.message}` });
  }
};

// ============================================================
// LEADS (Pipeline)
// ============================================================

// [GET] /api/pemasaran/leads
export const getAllLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(`
      SELECT l.*, c.nama_campaign 
      FROM pemasaran_leads l
      LEFT JOIN pemasaran_campaigns c ON l.id_campaign = c.id_campaign
      ORDER BY l.updated_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[getAllLeads] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// [POST] /api/pemasaran/leads
export const createLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nama_toko, kontak_person, no_telepon, id_campaign, estimasi_nilai_deal } = req.body;

    if (!nama_toko || !kontak_person || !no_telepon) {
      res.status(400).json({ success: false, message: 'Nama toko, kontak person, dan nomor telepon wajib diisi.' });
      return;
    }

    await pool.query(
      'INSERT INTO pemasaran_leads (nama_toko, kontak_person, no_telepon, id_campaign, estimasi_nilai_deal) VALUES (?, ?, ?, ?, ?)',
      [nama_toko.trim(), kontak_person.trim(), no_telepon.trim(), id_campaign || null, parseFloat(estimasi_nilai_deal) || 0]
    );

    res.status(201).json({ success: true, message: 'Lead baru berhasil ditambahkan ke pipeline.' });
  } catch (error: any) {
    console.error('[createLead] Error:', error);
    res.status(500).json({ success: false, message: `Gagal menambah lead: ${error.message}` });
  }
};

// [PATCH] /api/pemasaran/leads/:id/status — Drag & Drop Pipeline
export const updateLeadStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status_pipeline } = req.body;
    const leadId = parseInt(id, 10);

    if (isNaN(leadId) || !status_pipeline) {
      res.status(400).json({ success: false, message: 'ID Lead atau Status Pipeline tidak valid.' });
      return;
    }

    const validStatuses = ['New Lead', 'Follow Up', 'Negosiasi', 'Won_Deal', 'Lost'];
    if (!validStatuses.includes(status_pipeline)) {
      res.status(400).json({ success: false, message: `Status "${status_pipeline}" tidak dikenali.` });
      return;
    }

    const [currentLead]: any = await pool.query('SELECT status_pipeline FROM pemasaran_leads WHERE id_lead = ?', [leadId]);
    if (!currentLead.length) { res.status(404).json({ success: false, message: 'Lead tidak ditemukan.' }); return; }
    
    if ((currentLead[0].status_pipeline === 'Won_Deal' || currentLead[0].status_pipeline === 'Lost') && status_pipeline !== currentLead[0].status_pipeline) {
        res.status(403).json({ success: false, message: 'Lead yang sudah Won Deal atau Lost telah dikunci dan tidak dapat dipindahkan lagi.' });
        return;
    }

    const [result]: any = await pool.query(
      'UPDATE pemasaran_leads SET status_pipeline = ? WHERE id_lead = ?',
      [status_pipeline, leadId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Lead tidak ditemukan.' });
    } else {
      res.json({ success: true, message: `Lead berhasil dipindahkan ke ${status_pipeline}.` });
    }
  } catch (error: any) {
    console.error('[updateLeadStatus] Error:', error);
    res.status(500).json({ success: false, message: `Error update status: ${error.message}` });
  }
};

// [PATCH] /api/pemasaran/leads/:id — Update detail lead
export const updateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nama_toko, kontak_person, no_telepon, estimasi_nilai_deal } = req.body;
    const leadId = parseInt(id, 10);

    if (isNaN(leadId)) {
      res.status(400).json({ success: false, message: 'ID Lead tidak valid.' });
      return;
    }

    const [currentLead]: any = await pool.query('SELECT status_pipeline FROM pemasaran_leads WHERE id_lead = ?', [leadId]);
    if (!currentLead.length) { res.status(404).json({ success: false, message: 'Lead tidak ditemukan.' }); return; }
    
    if (currentLead[0].status_pipeline === 'Won_Deal' || currentLead[0].status_pipeline === 'Lost') {
        res.status(403).json({ success: false, message: 'Data master lead yang sudah Won Deal atau Lost telah dikunci dan tidak dapat diubah.' });
        return;
    }

    await pool.query(
      'UPDATE pemasaran_leads SET nama_toko = ?, kontak_person = ?, no_telepon = ?, estimasi_nilai_deal = ? WHERE id_lead = ?',
      [nama_toko?.trim(), kontak_person?.trim(), no_telepon?.trim(), parseFloat(estimasi_nilai_deal) || 0, leadId]
    );

    res.json({ success: true, message: 'Detail lead berhasil diperbarui.' });
  } catch (error: any) {
    console.error('[updateLead] Error:', error);
    res.status(500).json({ success: false, message: `Error update lead: ${error.message}` });
  }
};

// [DELETE] /api/pemasaran/leads/:id — Delete lead
export const deleteLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const leadId = parseInt(id, 10);

    if (isNaN(leadId)) {
      res.status(400).json({ success: false, message: 'ID Lead tidak valid.' });
      return;
    }

    const [result]: any = await pool.query('DELETE FROM pemasaran_leads WHERE id_lead = ?', [leadId]);

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Lead tidak ditemukan atau sudah dihapus.' });
    } else {
      res.json({ success: true, message: 'Lead berhasil dihapus secara permanen.' });
    }
  } catch (error: any) {
    console.error('[deleteLead] Error:', error);
    res.status(500).json({ success: false, message: `Error delete lead: ${error.message}` });
  }
};

// ============================================================
// AKTIVITAS (Log Histori)
// ============================================================

// [GET] /api/pemasaran/aktivitas/:id_lead
export const getAktivitasByLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_lead } = req.params;
    const leadId = parseInt(id_lead, 10);

    if (isNaN(leadId)) {
      res.status(400).json({ success: false, message: 'ID Lead tidak valid.' });
      return;
    }

    const [rows] = await pool.query(
      'SELECT id_aktivitas, tanggal, jenis_interaksi, catatan_hasil FROM pemasaran_aktivitas WHERE id_lead = ? ORDER BY tanggal DESC',
      [leadId]
    );

    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[getAktivitasByLead] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// [POST] /api/pemasaran/aktivitas
export const createAktivitas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_lead, jenis_interaksi, catatan_hasil } = req.body;

    if (!id_lead || !jenis_interaksi || !catatan_hasil) {
      res.status(400).json({ success: false, message: 'Lengkapi semua field aktivitas.' });
      return;
    }

    await pool.query(
      'INSERT INTO pemasaran_aktivitas (id_lead, jenis_interaksi, catatan_hasil) VALUES (?, ?, ?)',
      [parseInt(id_lead, 10), jenis_interaksi, catatan_hasil.trim()]
    );

    res.status(201).json({ success: true, message: 'Aktivitas berhasil dicatat.' });
  } catch (error: any) {
    console.error('[createAktivitas] Error:', error);
    res.status(500).json({ success: false, message: `Gagal catat aktivitas: ${error.message}` });
  }
};

// ============================================================
// KPI
// ============================================================

// [GET] /api/pemasaran/kpi
export const getPemasaranKPI = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Pipeline Value (Follow Up + Negosiasi)
    const [pipelineData]: any = await pool.query(
      "SELECT COALESCE(SUM(estimasi_nilai_deal), 0) as total FROM pemasaran_leads WHERE status_pipeline IN ('Follow Up', 'Negosiasi')"
    );
    const pipelineValue = parseFloat(pipelineData[0].total);

    // 2. Win Rate
    const [totalLeads]: any = await pool.query(
      'SELECT COUNT(*) as total FROM pemasaran_leads'
    );
    const [wonLeads]: any = await pool.query(
      "SELECT COUNT(*) as total FROM pemasaran_leads WHERE status_pipeline = 'Won_Deal'"
    );
    const totalCount = parseInt(totalLeads[0].total, 10);
    const wonCount = parseInt(wonLeads[0].total, 10);
    const winRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;

    // 3. Campaign ROI (Total Won Deal vs Total Budget)
    const [wonValue]: any = await pool.query(
      "SELECT COALESCE(SUM(estimasi_nilai_deal), 0) as total FROM pemasaran_leads WHERE status_pipeline = 'Won_Deal'"
    );
    const [totalBudget]: any = await pool.query(
      'SELECT COALESCE(SUM(budget_alokasi), 0) as total FROM pemasaran_campaigns'
    );
    const wonTotal = parseFloat(wonValue[0].total);
    const budgetTotal = parseFloat(totalBudget[0].total);
    const roi = budgetTotal > 0 ? Math.round(((wonTotal - budgetTotal) / budgetTotal) * 100) : 0;

    res.json({
      success: true,
      data: {
        pipeline_value: pipelineValue,
        win_rate: winRate,
        won_total: wonTotal,
        budget_total: budgetTotal,
        roi: roi
      }
    });
  } catch (error: any) {
    console.error('[getPemasaranKPI] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};
