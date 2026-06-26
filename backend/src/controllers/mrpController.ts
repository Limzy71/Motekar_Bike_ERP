import { Request, Response } from 'express';
import pool from '../config/database.js';
import { calculateHPPDetails } from './keuanganController.js';

/**
 * Controller untuk Modul MRP & Recursive Multi-Level BOM.
 */

interface WOReco {
  kode_sepeda: string;
  nama_barang: string;
  qty: number;
}

interface POReco {
  kode_barang: string;
  nama_barang: string;
  qty: number;
  id_vendor?: number;
}

// Helper to accumulate recommendations
class RecoAggregator {
  woMap = new Map<string, WOReco>();
  poMap = new Map<string, POReco>();

  addWO(kode: string, nama: string, qty: number) {
    if (this.woMap.has(kode)) {
      this.woMap.get(kode)!.qty += qty;
    } else {
      this.woMap.set(kode, { kode_sepeda: kode, nama_barang: nama, qty });
    }
  }

  addPO(kode: string, nama: string, qty: number, id_vendor?: number) {
    if (this.poMap.has(kode)) {
      this.poMap.get(kode)!.qty += qty;
    } else {
      this.poMap.set(kode, { kode_barang: kode, nama_barang: nama, qty, id_vendor });
    }
  }
}

// Algoritma Rekursif Peledakan BOM
async function explodeBOM(
  connection: any,
  kodeItem: string,
  qtyTarget: number,
  aggregator: RecoAggregator
): Promise<void> {
  // 1. Cek tipe item dan stok di Master Inventory
  const [stokData]: any = await connection.query(
    'SELECT nama_barang, tipe_item, jumlah_stok, stok_committed, harga_standar, id_vendor FROM inventory_stok WHERE kode_barang = ?',
    [kodeItem]
  );

  if (stokData.length === 0) {
    throw new Error(`BOM Gagal Meledak: Item [${kodeItem}] tidak ditemukan di Master Gudang.`);
  }

  const stok = stokData[0];
  const stokAvailable = stok.jumlah_stok - stok.stok_committed;

  // 2. Cabang Logika Berdasarkan Tipe Item
  if (stok.tipe_item === 'RM') {
    // Validasi Harga Standar
    const harga = parseFloat(stok.harga_standar);
    if (isNaN(harga) || harga <= 0) {
      throw new Error(`BOM Gagal Meledak: Komponen [${kodeItem}] belum memiliki harga standar.`);
    }
    // Masukkan ke keranjang Rekomendasi PO
    aggregator.addPO(kodeItem, stok.nama_barang, qtyTarget, stok.id_vendor);
  } 
  else if (stok.tipe_item === 'SA' || stok.tipe_item === 'FG') {
    // Jika SA/FG, cek ketersediaan stok
    let deficit = qtyTarget;
    
    // (Opsional) Jika algoritma mempertimbangkan stok gudang untuk SA
    // Jika user meledakkan FG dari pesanan penjualan, kita asumsikan target adalah murni defisit.
    // Tapi untuk komponen SA di dalam BOM, kita bisa memotong dari stok yang ada:
    if (stokAvailable > 0) {
      deficit = qtyTarget - stokAvailable;
    }

    if (deficit > 0) {
      // Masukkan sisa defisit ke keranjang Rekomendasi WO
      aggregator.addWO(kodeItem, stok.nama_barang, deficit);

      // Cari resep BOM
      const [bomHeader]: any = await connection.query(
        'SELECT id_bom FROM manufaktur_bom_header WHERE kode_item_parent = ?',
        [kodeItem]
      );

      if (bomHeader.length === 0) {
        throw new Error(`BOM Gagal Meledak: Resep BOM untuk rakitan [${kodeItem}] tidak ditemukan.`);
      }

      const idBom = bomHeader[0].id_bom;

      // Cari komponen penyusunnya
      const [bomDetails]: any = await connection.query(
        'SELECT kode_item_komponen, qty_kebutuhan FROM manufaktur_bom_detail WHERE id_bom = ?',
        [idBom]
      );

      if (bomDetails.length === 0) {
        throw new Error(`BOM Gagal Meledak: Resep BOM [${kodeItem}] kosong / tidak memiliki komponen.`);
      }

      // PANGGIL KEMBALI fungsi rekursif (THE RECURSIVE ALGORITHM)
      for (const detail of bomDetails) {
        const qtyKebutuhanTotal = detail.qty_kebutuhan * deficit;
        await explodeBOM(connection, detail.kode_item_komponen, qtyKebutuhanTotal, aggregator);
      }
    }
  }
}

// ============================================================
// [POST] /api/mrp/explode — Uji Ledakan BOM (Tanpa Insert)
// ============================================================
export const testExplodeBOM = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { kode_item, qty_target } = req.body;

    if (!kode_item || !qty_target || qty_target <= 0) {
      res.status(400).json({ success: false, message: 'Kode item dan Qty (target) tidak valid.' });
      connection.release();
      return;
    }

    const aggregator = new RecoAggregator();
    
    // Mulai ledakan (hanya pembacaan, tidak butuh transaksi khusus, tapi pakai try catch)
    await explodeBOM(connection, kode_item, parseInt(qty_target, 10), aggregator);

    const woList = Array.from(aggregator.woMap.values());
    const poList = Array.from(aggregator.poMap.values());

    res.json({
      success: true,
      data: {
        wo_recommendations: woList,
        po_recommendations: poList
      }
    });

  } catch (error: any) {
    console.error('[testExplodeBOM] Error:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// ============================================================
// [POST] /api/mrp/execute — Eksekusi Transaksi Massal (Bulk Insert)
// ============================================================
export const executeMRP = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { wo_list, po_list } = req.body;
    
    if (!Array.isArray(wo_list) || !Array.isArray(po_list)) {
      res.status(400).json({ success: false, message: 'Format data eksekusi tidak valid.' });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    const year = new Date().getFullYear();
    const tsSuffix = Date.now().toString().slice(-4); // Helper for unique IDs
    
    // 1. Eksekusi WO Recommendations (arsitektur Header-Detail)
    for (const wo of wo_list) {
      const nomor_wo = `WO/MTK/${year}/${Math.floor(Math.random() * 9000) + 1000}-MRP-${tsSuffix}`;
      
      // Lookup inventory ID dari kode_barang
      const [invLookup]: any = await connection.query(
        'SELECT id FROM inventory_stok WHERE kode_barang = ?',
        [wo.kode_sepeda]
      );
      if (invLookup.length === 0) throw new Error(`Item ${wo.kode_sepeda} tidak ditemukan di Master Gudang.`);
      
      await connection.query(
        'INSERT INTO operasi_wo_header (nomor_wo, id_inventory_fg, jumlah_produksi, status) VALUES (?, ?, ?, ?)',
        [nomor_wo, invLookup[0].id, wo.qty, 'ON_PROGRESS']
      );
    }

    // 2. Eksekusi PO Recommendations (Grouped by Vendor) — STRICT AVL ENFORCEMENT
    const groupedPOs = new Map<number, typeof po_list>();
    for (const po of po_list) {
      if (!po.id_vendor) {
        throw new Error(`[AVL VIOLATION] Item "${po.kode_barang}" (${po.nama_barang}) tidak memiliki relasi Vendor di Master Inventory. Perbaiki data inventory_stok terlebih dahulu.`);
      }
      const vId = po.id_vendor;
      if (!groupedPOs.has(vId)) groupedPOs.set(vId, []);
      groupedPOs.get(vId)!.push(po);
    }

    for (const [vendorId, items] of groupedPOs.entries()) {
      const nomor_pr = `PR/MTK/${year}/${Math.floor(Math.random() * 9000) + 1000}-MRP-${tsSuffix}`;
      const [headerResult]: any = await connection.query(
        'INSERT INTO pengadaan_pr_header (nomor_pr, id_vendor, status_pr) VALUES (?, ?, ?)',
        [nomor_pr, vendorId, 'Menunggu Persetujuan']
      );
      
      const prHeaderId = headerResult.insertId;
      
      for (const po of items) {
        await connection.query(
          'INSERT INTO pengadaan_pr_detail (id_pr_header, kode_barang, jumlah, satuan) VALUES (?, ?, ?, ?)',
          [prHeaderId, po.kode_barang, po.qty, 'pcs']
        );
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Eksekusi Rekomendasi MRP Berhasil. Seluruh WO & PO diterbitkan.' });

  } catch (error: any) {
    await connection.rollback();
    console.error('[executeMRP] Transaction Error:', error);
    res.status(500).json({ success: false, message: `Eksekusi Massal Gagal: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [GET] /api/mrp/bom — Mengambil Master BOM (Header & Detail)
// ============================================================
export const getMasterBOM = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    // Ambil header
    const [headers]: any = await connection.query(`
      SELECT b.id_bom, b.kode_item_parent, b.nama_resep, i.nama_barang, i.tipe_item, i.biaya_rakit, i.biaya_antar
      FROM manufaktur_bom_header b
      JOIN inventory_stok i ON b.kode_item_parent = i.kode_barang
    `);

    // Ambil detail
    const [details]: any = await connection.query(`
      SELECT d.id_bom, d.kode_item_komponen, d.qty_kebutuhan, i.nama_barang, i.tipe_item 
      FROM manufaktur_bom_detail d
      JOIN inventory_stok i ON d.kode_item_komponen = i.kode_barang
    `);

    // Mapping ke struktur nested (Tree) dan hitung biaya
    const bomTree = [];
    for (const header of headers) {
      const children = details.filter((d: any) => d.id_bom === header.id_bom);
      const costDetail = await calculateHPPDetails(connection, header.kode_item_parent, header.tipe_item === 'FG');
      
      bomTree.push({
        ...header,
        children: children,
        biaya_rakit: parseFloat(header.biaya_rakit),
        biaya_antar: parseFloat(header.biaya_antar),
        material_cost: costDetail.materialCost,
        total_modal: costDetail.total
      });
    }

    res.json({
      success: true,
      data: bomTree
    });

  } catch (error: any) {
    console.error('[getMasterBOM] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// [PATCH] /api/mrp/costs/:kode_barang — Update Biaya Rakit & Antar
// ============================================================
export const updateCosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_barang } = req.params;
    const { biaya_rakit, biaya_antar } = req.body;

    const rakit = parseFloat(biaya_rakit) || 0;
    const antar = parseFloat(biaya_antar) || 0;

    const [result]: any = await pool.query(
      'UPDATE inventory_stok SET biaya_rakit = ?, biaya_antar = ? WHERE kode_barang = ?',
      [rakit, antar, kode_barang]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Item tidak ditemukan.' });
      return;
    }

    res.json({ success: true, message: 'Biaya master berhasil diperbarui.' });
  } catch (error: any) {
    console.error('[updateCosts] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [GET] /api/mrp/items — Ambil item FG/SA untuk Dropdown Explode
// ============================================================
export const getExplodableItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      "SELECT kode_barang, nama_barang, tipe_item FROM inventory_stok WHERE tipe_item IN ('FG', 'SA')"
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
