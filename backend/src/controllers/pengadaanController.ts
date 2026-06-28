import { Request, Response } from 'express';
import pool from '../config/database.js';
import { generatePONumber } from './poController.js';

// ============================================================
// HELPER: Generate PR Number (Format: PR/MTK/YYYY/XXXX)
// ============================================================
export async function generatePRNumber(connection: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PR/MTK/${year}/`;

    const [rows]: any = await connection.query(
        `SELECT nomor_pr FROM pengadaan_pr_header WHERE nomor_pr LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
    );

    let nextNum = 1;
    if (rows.length > 0) {
        const lastPR = rows[0].nomor_pr;
        const lastSequence = parseInt(lastPR.split('/').pop() || '0', 10);
        nextNum = lastSequence + 1;
    }

    const sequence = nextNum.toString().padStart(4, '0');
    return `${prefix}${sequence}`;
}

/**
 * Controller untuk Modul Pengadaan (Purchase Requisition).
 * Endpoint ini dilindungi oleh authMiddleware + requireRole('Owner', 'Admin', 'Pengadaan').
 */

// ============================================================
// [GET] /api/pengadaan/vendors — Ambil semua vendor
// ============================================================
export const getVendors = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query('SELECT * FROM master_vendor ORDER BY nama_vendor ASC');
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [GET] /api/pengadaan/items — Ambil item RM
// ============================================================
export const getItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query("SELECT id, kode_barang, nama_barang, satuan, id_vendor, harga_standar FROM inventory_stok WHERE tipe_item = 'RM' ORDER BY nama_barang ASC");
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [GET] /api/pengadaan — Ambil semua daftar PR (Header & Detail)
// ============================================================
export const getAllPR = async (req: Request, res: Response): Promise<void> => {
  try {
    const [headers]: any = await pool.query(`
      SELECT p.id, p.nomor_pr, p.status_pr, p.created_at, v.nama_vendor
      FROM pengadaan_pr_header p
      JOIN master_vendor v ON p.id_vendor = v.id
      ORDER BY p.id DESC
    `);

    const [details]: any = await pool.query(`
      SELECT d.id_pr_header, d.kode_barang, d.jumlah, d.satuan, i.nama_barang, i.harga_standar
      FROM pengadaan_pr_detail d
      JOIN inventory_stok i ON d.kode_barang = i.kode_barang
    `);

    const result = headers.map((header: any) => ({
      ...header,
      items: details.filter((d: any) => d.id_pr_header === header.id)
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('[getAllPR] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/pengadaan — Simpan PR Baru (Transaksi)
// ============================================================
export const createPR = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { id_vendor, pr_items } = req.body;

    if (!id_vendor || !Array.isArray(pr_items) || pr_items.length === 0) {
      res.status(400).json({ success: false, message: 'Data PR tidak lengkap.' });
      connection.release();
      return;
    }

    const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [id_vendor]);
    if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
      res.status(400).json({ success: false, message: `Akses Ditolak: Vendor telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}` });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    const generated_nomor_pr = await generatePRNumber(connection);

    const [headerResult]: any = await connection.query(
      'INSERT INTO pengadaan_pr_header (nomor_pr, id_vendor, status_pr) VALUES (?, ?, ?)',
      [generated_nomor_pr, id_vendor, 'Menunggu Persetujuan']
    );

    const prHeaderId = headerResult.insertId;

    for (const item of pr_items) {
      const qty = parseInt(item.jumlah, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Jumlah barang untuk ${item.kode_barang} tidak valid.`);
      }

      // THE IRON GATE: Strict AVL Validation
      const [itemRows]: any = await connection.query(
        'SELECT id_vendor FROM inventory_stok WHERE kode_barang = ?',
        [item.kode_barang]
      );
      
      if (itemRows.length === 0) {
        throw new Error(`Barang ${item.kode_barang} tidak ditemukan di master inventory.`);
      }

      if (itemRows[0].id_vendor?.toString() !== id_vendor.toString()) {
        throw new Error(`Pelanggaran AVL: Komponen [${item.kode_barang}] tidak sesuai dengan hak pasokan suplier yang dipilih.`);
      }

      await connection.query(
        'INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES (?, ?, ?, ?)',
        [prHeaderId, item.kode_barang, qty, item.satuan]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, message: 'Purchase Request berhasil diajukan.' });

  } catch (error: any) {
    await connection.rollback();
    console.error('[createPR] Transaction Error:', error);
    res.status(500).json({ success: false, message: `Gagal membuat PR: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [PATCH] /api/pengadaan/:id/approve — Setujui PR
// ============================================================
export const approvePR = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const prId = parseInt(id, 10);

    if (isNaN(prId)) {
      res.status(400).json({ success: false, message: 'ID PR tidak valid.' });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    const [result]: any = await connection.query(
      'UPDATE pengadaan_pr_header SET status_pr = ? WHERE id = ? AND status_pr = ?',
      ['Diproses Vendor', prId, 'Menunggu Persetujuan']
    );

    if (result.affectedRows > 0) {
      // Auto-generate PO ISSUED with PR's vendor and id_pr linkage
      const [prs]: any = await connection.query('SELECT * FROM pengadaan_pr_header WHERE id = ?', [prId]);
      const pr = prs[0];

      // HARD GUARD VENDOR BLACKLIST
      const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [pr.id_vendor]);
      if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
        await connection.rollback();
        res.status(400).json({ success: false, message: `Akses Ditolak: Vendor telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}` });
        return;
      }

      const [prDetails]: any = await connection.query('SELECT * FROM pengadaan_pr_detail WHERE id_pr_header = ?', [prId]);
      
      const nomor_po = await generatePONumber(connection);
      const [poInsert]: any = await connection.query(
          'INSERT INTO pengadaan_po_header (nomor_po, id_vendor, status, catatan, id_pr) VALUES (?, ?, ?, ?, ?)',
          [nomor_po, pr.id_vendor, 'DRAFT', `Generated from PR ${pr.nomor_pr}`, prId]
      );
      const poId = poInsert.insertId;

      let total_nilai = 0;
      for (const detail of prDetails) {
          const [items]: any = await connection.query('SELECT id, harga_standar FROM inventory_stok WHERE kode_barang = ?', [detail.kode_barang]);
          if (items.length === 0) throw new Error(`Item ${detail.kode_barang} tidak ditemukan di master stok`);
          const id_inventory = items[0].id;
          const harga = parseFloat(items[0].harga_standar || 0);
          const qty = detail.jumlah;
          total_nilai += (qty * harga);

          await connection.query(
              'INSERT INTO pengadaan_po_detail (id_po_header, id_inventory_material, qty, harga_satuan) VALUES (?, ?, ?, ?)',
              [poId, id_inventory, qty, harga]
          );
      }
      await connection.query('UPDATE pengadaan_po_header SET total_nilai = ? WHERE id = ?', [total_nilai, poId]);

      await connection.commit();
      res.json({ success: true, message: 'PR berhasil disetujui dan PO otomatis terbuat (Status: DRAFT).' });
    } else {
      await connection.rollback();
      res.status(404).json({ success: false, message: 'PR tidak ditemukan atau sudah disetujui sebelumnya.' });
    }
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: `Error update PR: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [POST] /api/pengadaan/pr/bulk-approve — Setujui Semua PR Menunggu Persetujuan
// ============================================================
export const bulkApprovePR = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [prs]: any = await connection.query('SELECT * FROM pengadaan_pr_header WHERE status_pr IN (?, ?)', ['Menunggu Persetujuan', 'Draft']);
    
    if (prs.length === 0) {
      await connection.rollback();
      res.status(404).json({ success: false, message: 'Tidak ada PR yang perlu disetujui.' });
      connection.release();
      return;
    }

    let generatedCount = 0;

    for (const pr of prs) {
      // HARD GUARD VENDOR BLACKLIST
      const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [pr.id_vendor]);
      if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
        throw new Error(`Vendor ${pr.id_vendor} telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}`);
      }

      await connection.query('UPDATE pengadaan_pr_header SET status_pr = ? WHERE id = ?', ['Diproses Vendor', pr.id]);

      const [prDetails]: any = await connection.query('SELECT * FROM pengadaan_pr_detail WHERE id_pr_header = ?', [pr.id]);
      if (prDetails.length === 0) continue;

      const nomor_po = await generatePONumber(connection);
      const [poInsert]: any = await connection.query(
          'INSERT INTO pengadaan_po_header (nomor_po, id_vendor, status, catatan, id_pr) VALUES (?, ?, ?, ?, ?)',
          [nomor_po, pr.id_vendor, 'DRAFT', `Generated from PR ${pr.nomor_pr}`, pr.id]
      );
      const poId = poInsert.insertId;

      let total_nilai = 0;
      for (const detail of prDetails) {
          const [items]: any = await connection.query('SELECT id, harga_standar FROM inventory_stok WHERE kode_barang = ?', [detail.kode_barang]);
          if (items.length === 0) throw new Error(`Item ${detail.kode_barang} tidak ditemukan`);
          const id_inventory = items[0].id;
          const harga = parseFloat(items[0].harga_standar || 0);
          const qty = detail.jumlah;
          total_nilai += (qty * harga);

          await connection.query(
              'INSERT INTO pengadaan_po_detail (id_po_header, id_inventory_material, qty, harga_satuan) VALUES (?, ?, ?, ?)',
              [poId, id_inventory, qty, harga]
          );
      }
      await connection.query('UPDATE pengadaan_po_header SET total_nilai = ? WHERE id = ?', [total_nilai, poId]);
      generatedCount++;
    }

    await connection.commit();
    res.json({ success: true, message: `${generatedCount} PR berhasil disetujui dan PO otomatis terbuat (Status: DRAFT).` });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: `Error bulk update PR: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [DELETE] /api/pengadaan/:id — Hapus PR
// ============================================================
export const deletePR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const prId = parseInt(id, 10);

    if (isNaN(prId)) {
      res.status(400).json({ success: false, message: 'ID PR tidak valid.' });
      return;
    }

    const [check]: any = await pool.query('SELECT status_pr FROM pengadaan_pr_header WHERE id = ?', [prId]);
    if (check.length === 0) {
      res.status(404).json({ success: false, message: 'PR tidak ditemukan.' });
      return;
    }

    if (['Diproses Vendor', 'Selesai'].includes(check[0].status_pr)) {
      res.status(403).json({ success: false, message: 'PR yang sudah diproses tidak dapat dihapus.' });
      return;
    }

    // Revert restock requests linked to this PR's materials back to 'Pending'
    await pool.query(`
      UPDATE pengadaan_restock_requests r
      JOIN operasi_wo_header w ON r.nomor_wo = w.nomor_wo
      SET r.status = 'Pending'
      WHERE r.status = 'Selesai' 
      AND w.status NOT IN ('COMPLETED', 'CANCELLED')
      AND r.id_inventory_material IN (
         SELECT i.id FROM inventory_stok i 
         JOIN pengadaan_pr_detail d ON i.kode_barang = d.kode_barang
         WHERE d.id_pr_header = ?
      )
    `, [prId]);

    // Hapus detail terlebih dahulu untuk menghindari foreign key constraint
    await pool.query('DELETE FROM pengadaan_pr_detail WHERE id_pr_header = ?', [prId]);

    const [result]: any = await pool.query(
      'DELETE FROM pengadaan_pr_header WHERE id = ?',
      [prId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Data PR berhasil dihapus dan permintaan material dikembalikan ke kotak masuk.' });
    } else {
      res.status(404).json({ success: false, message: 'PR tidak ditemukan.' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Error menghapus data: ${error.message}` });
  }
};

// ============================================================
// [DELETE] /api/pengadaan — Hapus Semua PR
// ============================================================
export const bulkDeletePR = async (req: Request, res: Response): Promise<void> => {
  try {
    // Revert restock requests for all deletable PRs back to 'Pending'
    await pool.query(`
      UPDATE pengadaan_restock_requests r
      JOIN operasi_wo_header w ON r.nomor_wo = w.nomor_wo
      SET r.status = 'Pending'
      WHERE r.status = 'Selesai' 
      AND w.status NOT IN ('COMPLETED', 'CANCELLED')
      AND r.id_inventory_material IN (
         SELECT i.id FROM inventory_stok i 
         JOIN pengadaan_pr_detail d ON i.kode_barang = d.kode_barang
         JOIN pengadaan_pr_header h ON d.id_pr_header = h.id
         WHERE h.status_pr NOT IN ('Diproses Vendor', 'Selesai')
      )
    `);

    await pool.query(`
      DELETE FROM pengadaan_pr_detail 
      WHERE id_pr_header IN (
        SELECT id FROM pengadaan_pr_header WHERE status_pr NOT IN ('Diproses Vendor', 'Selesai')
      )
    `);
    const [result]: any = await pool.query(`
      DELETE FROM pengadaan_pr_header WHERE status_pr NOT IN ('Diproses Vendor', 'Selesai')
    `);
    res.json({ success: true, message: `Berhasil menghapus ${result.affectedRows} PR dan mengembalikan request material ke kotak masuk.` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Error menghapus semua PR: ${error.message}` });
  }
};

// ============================================================
// [GET] /api/pengadaan/alerts — Ambil data stok kritis
// ============================================================
export const getReorderAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        i.id,
        i.kode_barang, 
        i.nama_barang, 
        i.jumlah_stok as jumlah_stok_sekarang, 
        i.reorder_point, 
        i.minimum_stock,
        i.satuan,
        i.bom_ratio,
        v.id as id_vendor, 
        v.nama_vendor,
        COALESCE((
          SELECT SUM(d.jumlah) 
          FROM pengadaan_pr_detail d
          JOIN pengadaan_pr_header h ON d.id_pr_header = h.id
          WHERE d.kode_barang = i.kode_barang 
            AND h.status_pr IN ('Menunggu Persetujuan', 'Diproses Vendor', 'Draft')
        ), 0) AS incoming_pr,
        COALESCE((
          SELECT SUM(pd.qty) 
          FROM pengadaan_po_detail pd
          JOIN pengadaan_po_header ph ON pd.id_po_header = ph.id
          WHERE pd.id_inventory_material = i.id 
            AND ph.status IN ('DRAFT', 'ISSUED', 'APPROVED', 'SENT_TO_VENDOR')
        ), 0) AS incoming_po
      FROM inventory_stok i
      LEFT JOIN master_vendor v ON i.id_vendor = v.id
      WHERE i.reorder_point > 0 AND i.id_vendor IS NOT NULL
      HAVING (jumlah_stok_sekarang + incoming_pr + incoming_po) <= reorder_point
      ORDER BY jumlah_stok_sekarang ASC
    `);

    // Calculate qty_saran_pesan
    const processedRows = rows.map((row: any) => {
      const currentStock = parseInt(row.jumlah_stok_sekarang) || 0;
      const incomingPR = parseInt(row.incoming_pr) || 0;
      const incomingPO = parseInt(row.incoming_po) || 0;
      const effectiveStock = currentStock + incomingPR + incomingPO;

      return {
        ...row,
        effective_stock: effectiveStock,
        qty_saran_pesan: ((row.reorder_point * 2) - effectiveStock) * row.bom_ratio
      };
    });

    res.json({ success: true, data: processedRows });
  } catch (error: any) {
    console.error('[getReorderAlerts] Error:', error);
    res.status(500).json({ success: false, message: `Error fetching alerts: ${error.message}` });
  }
};

// ============================================================
// [POST] /api/pengadaan/pr/auto-generate — Bulk Generate PR dari Defisit
// ============================================================
export const autoGeneratePR = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    // 1. Get all deficit items that DON'T already have a pending PR
    const [deficitItems]: any = await connection.query(`
      SELECT 
        i.id, i.kode_barang, i.satuan, i.jumlah_stok, i.reorder_point, i.bom_ratio,
        v.id as id_vendor,
        COALESCE((
          SELECT SUM(d.jumlah) 
          FROM pengadaan_pr_detail d
          JOIN pengadaan_pr_header h ON d.id_pr_header = h.id
          WHERE d.kode_barang = i.kode_barang 
            AND h.status_pr IN ('Menunggu Persetujuan', 'Diproses Vendor', 'Draft')
        ), 0) AS incoming_pr,
        COALESCE((
          SELECT SUM(pd.qty) 
          FROM pengadaan_po_detail pd
          JOIN pengadaan_po_header ph ON pd.id_po_header = ph.id
          WHERE pd.id_inventory_material = i.id 
            AND ph.status IN ('DRAFT', 'ISSUED', 'APPROVED', 'SENT_TO_VENDOR')
        ), 0) AS incoming_po,
        COALESCE((
          SELECT SUM(r.jumlah_diminta)
          FROM pengadaan_restock_requests r
          WHERE r.id_inventory_material = i.id AND r.status = 'Pending'
        ), 0) AS wo_deficit
      FROM inventory_stok i
      LEFT JOIN master_vendor v ON i.id_vendor = v.id
      WHERE i.id_vendor IS NOT NULL AND i.tipe_item = 'RM'
      HAVING (jumlah_stok + incoming_pr + incoming_po) <= reorder_point OR wo_deficit > 0
    `);

    if (deficitItems.length === 0) {
      res.status(400).json({ success: false, message: 'Tidak ada barang defisit yang perlu di-restok.' });
      return;
    }

    // 2. Group by Vendor
    const groupedByVendor: { [key: string]: any[] } = {};
    for (const item of deficitItems) {
      const vendorIdStr = item.id_vendor.toString();
      if (!groupedByVendor[vendorIdStr]) {
        groupedByVendor[vendorIdStr] = [];
      }
      groupedByVendor[vendorIdStr].push(item);
    }

    await connection.beginTransaction();

    let prCreatedCount = 0;
    const orderedItemIds: number[] = [];

    // 3. Create PR per Vendor
    for (const vendorIdStr in groupedByVendor) {
      const items = groupedByVendor[vendorIdStr];
      const vendorId = parseInt(vendorIdStr, 10);

      // Generate PR Number
      const nomor_pr = await generatePRNumber(connection);

      const [headerResult]: any = await connection.query(
        'INSERT INTO pengadaan_pr_header (nomor_pr, id_vendor, status_pr) VALUES (?, ?, ?)',
        [nomor_pr, vendorId, 'Menunggu Persetujuan']
      );

      const prHeaderId = headerResult.insertId;

      for (const item of items) {
        orderedItemIds.push(item.id);
        // Calculate Qty
        const effectiveStock = (parseInt(item.jumlah_stok) || 0) + (parseInt(item.incoming_pr) || 0) + (parseInt(item.incoming_po) || 0);
        let qtySaranPesan = 0;
        
        if (effectiveStock <= item.reorder_point) {
            qtySaranPesan = ((item.reorder_point * 2) - effectiveStock) * (item.bom_ratio || 1);
        }
        
        if (item.wo_deficit > qtySaranPesan) {
            qtySaranPesan = item.wo_deficit;
        }

        const qty = qtySaranPesan > 0 ? qtySaranPesan : 1;

        await connection.query(
          'INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES (?, ?, ?, ?)',
          [prHeaderId, item.kode_barang, qty, item.satuan]
        );
      }
      prCreatedCount++;
    }

    if (orderedItemIds.length > 0) {
        await connection.query(
            "UPDATE pengadaan_restock_requests SET status = 'Selesai' WHERE status = 'Pending' AND id_inventory_material IN (?)",
            [orderedItemIds]
        );
    }

    await connection.commit();

    res.status(201).json({ 
      success: true, 
      message: `Auto-Generate sukses! ${prCreatedCount} PR baru telah dibuat untuk barang defisit.` 
    });

  } catch (error: any) {
    await connection.rollback();
    console.error('[autoGeneratePR] Error:', error);
    res.status(500).json({ success: false, message: `Gagal auto-generate PR: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [POST] /api/pengadaan/requests — Buat request restok (Dari Operasi)
// ============================================================
export const createRestockRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nomor_wo, items } = req.body;
    
    if (!nomor_wo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: 'Data request restok tidak lengkap.' });
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of items) {
        await connection.query(
          'INSERT INTO pengadaan_restock_requests (id_inventory_material, nomor_wo, jumlah_diminta, status) VALUES (?, ?, ?, ?)',
          [item.id_inventory_material, nomor_wo, item.jumlah_diminta, 'Pending']
        );
      }

      await connection.commit();
      res.status(201).json({ success: true, message: 'Permintaan material berhasil dikirim ke Pengadaan.' });
    } catch (err: any) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('[createRestockRequest] Error:', error);
    res.status(500).json({ success: false, message: `Error kirim permintaan restok: ${error.message}` });
  }
};

// ============================================================
// [GET] /api/pengadaan/requests — Ambil daftar request pending
// ============================================================
export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const [manualRequests]: any = await pool.query(`
      SELECT 
        r.id, 
        r.id_inventory_material, 
        r.nomor_wo, 
        r.jumlah_diminta, 
        r.status, 
        r.created_at,
        i.kode_barang,
        i.nama_barang,
        i.satuan
      FROM pengadaan_restock_requests r
      JOIN inventory_stok i ON r.id_inventory_material = i.id
      WHERE r.status = 'Pending'
      ORDER BY r.created_at ASC
    `);

    // Auto-Alerts (Safety Stock)
    const [autoAlerts]: any = await pool.query(`
      SELECT 
        i.id as id_inventory_material, 
        i.kode_barang,
        i.nama_barang,
        i.satuan,
        i.reorder_point,
        i.jumlah_stok,
        COALESCE((
          SELECT SUM(d.jumlah) 
          FROM pengadaan_pr_detail d
          JOIN pengadaan_pr_header h ON d.id_pr_header = h.id
          WHERE d.kode_barang = i.kode_barang 
            AND h.status_pr IN ('Menunggu Persetujuan', 'Diproses Vendor', 'Draft')
        ), 0) AS incoming_pr,
        COALESCE((
          SELECT SUM(pd.qty) 
          FROM pengadaan_po_detail pd
          JOIN pengadaan_po_header ph ON pd.id_po_header = ph.id
          WHERE pd.id_inventory_material = i.id 
            AND ph.status IN ('DRAFT', 'ISSUED', 'APPROVED', 'SENT_TO_VENDOR')
        ), 0) AS incoming_po
      FROM inventory_stok i
      WHERE i.reorder_point > 0 AND i.tipe_item = 'RM'
      HAVING (jumlah_stok + incoming_pr + incoming_po) < reorder_point
    `);

    const combined = [
      ...manualRequests,
      ...autoAlerts.map((a: any) => {
        const effectiveStock = (parseInt(a.jumlah_stok) || 0) + (parseInt(a.incoming_pr) || 0) + (parseInt(a.incoming_po) || 0);
        return {
          id: -a.id_inventory_material, 
          id_inventory_material: a.id_inventory_material,
          nomor_wo: `⚠️ MRP ALARM (Batas Min: ${a.reorder_point})`,
          jumlah_diminta: a.reorder_point - effectiveStock,
          status: 'Defisit',
          created_at: new Date().toISOString(),
          kode_barang: a.kode_barang,
          nama_barang: a.nama_barang,
          satuan: a.satuan
        };
      })
    ];

    res.json({ success: true, data: combined });
  } catch (error: any) {
    console.error('[getPendingRequests] Error:', error);
    res.status(500).json({ success: false, message: `Error load pending requests: ${error.message}` });
  }
};

// ============================================================
// [PATCH] /api/pengadaan/requests/:id — Selesaikan request
// ============================================================
export const completeRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);

    if (numericId < 0) {
       res.json({ success: true, message: 'Ini adalah alarm otomatis dari sistem MRP. Alarm akan hilang dengan sendirinya ketika stok gudang bertambah.' });
       return;
    }

    const [result]: any = await pool.query("UPDATE pengadaan_restock_requests SET status = 'Selesai' WHERE id = ?", [numericId]);
    
    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Permintaan restok berhasil ditandai selesai.' });
    } else {
      res.status(404).json({ success: false, message: 'Data request tidak ditemukan.' });
    }
  } catch (error: any) {
    console.error('[completeRequest] Error:', error);
    res.status(500).json({ success: false, message: `Error complete request: ${error.message}` });
  }
};
