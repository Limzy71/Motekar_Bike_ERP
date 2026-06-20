import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Controller untuk Modul Keuangan & Akuntansi Biaya (HPP / COGS Engine).
 * 
 * calculateHPP — Fungsi helper terpusat, digunakan oleh mutuController & penjualanController.
 * Membaca BOM detail dan harga_standar di master gudang untuk menghitung modal per unit.
 */

// ============================================================
// HELPER: calculateHPP — Harga Pokok Produksi per Unit
// ============================================================
export async function calculateHPP(connection: any, kodeSepeda: string): Promise<number> {
  // 1. Cari resep BOM header untuk item ini
  const [bomHeader]: any = await connection.query(
    'SELECT id_bom FROM manufaktur_bom_header WHERE kode_item_parent = ?',
    [kodeSepeda]
  );

  if (bomHeader.length === 0) {
    // Jika tidak ada BOM, fallback ke harga_standar item itu sendiri
    const [itemData]: any = await connection.query(
      'SELECT harga_standar FROM inventory_stok WHERE kode_barang = ?',
      [kodeSepeda]
    );
    if (itemData.length > 0 && parseFloat(itemData[0].harga_standar) > 0) {
      return parseFloat(itemData[0].harga_standar);
    }
    return 0;
  }

  const idBom = bomHeader[0].id_bom;

  // 2. Ambil semua komponen detail beserta harga_standar dari master gudang
  const [details]: any = await connection.query(
    `SELECT d.qty_kebutuhan, i.harga_standar
     FROM manufaktur_bom_detail d
     JOIN inventory_stok i ON d.kode_item_komponen = i.kode_barang
     WHERE d.id_bom = ?`,
    [idBom]
  );

  // 3. Akumulasi: SUM(qty_kebutuhan * harga_standar)
  let totalHPP = 0;
  for (const detail of details) {
    const harga = parseFloat(detail.harga_standar);
    const qty = parseInt(detail.qty_kebutuhan, 10);
    totalHPP += qty * harga;
  }

  return totalHPP;
}

// ============================================================
// HELPER: insertJurnal — Sisipkan entri jurnal keuangan
// ============================================================
export async function insertJurnal(
  connection: any,
  referensi: string,
  keterangan: string,
  tipeAkun: 'Aset_Persediaan' | 'Pendapatan' | 'HPP' | 'Kas_Bank',
  posisi: 'Debit' | 'Kredit',
  nominal: number
): Promise<void> {
  await connection.query(
    'INSERT INTO keuangan_jurnal (referensi_dokumen, keterangan, tipe_akun, posisi, nominal) VALUES (?, ?, ?, ?, ?)',
    [referensi, keterangan, tipeAkun, posisi, nominal]
  );
}

// ============================================================
// [GET] /api/keuangan/jurnal — Ambil seluruh Buku Besar
// ============================================================
export const getAllJurnal = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id_jurnal, tanggal, referensi_dokumen, keterangan, tipe_akun, posisi, nominal FROM keuangan_jurnal ORDER BY tanggal DESC, id_jurnal DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[getAllJurnal] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// [GET] /api/keuangan/kpi — Kalkulasi Metrik Eksekutif
// ============================================================
export const getKPI = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Total Aset Persediaan = SUM(Debit Aset_Persediaan) - SUM(Kredit Aset_Persediaan)
    const [asetDebit]: any = await pool.query(
      "SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Aset_Persediaan' AND posisi = 'Debit'"
    );
    const [asetKredit]: any = await pool.query(
      "SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Aset_Persediaan' AND posisi = 'Kredit'"
    );
    const totalAsetPersediaan = parseFloat(asetDebit[0].total) - parseFloat(asetKredit[0].total);

    // 2. Pendapatan Kotor Bulan Ini = SUM(Kredit Pendapatan) WHERE month = current
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    const [pendapatan]: any = await pool.query(
      "SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'Pendapatan' AND posisi = 'Kredit' AND tanggal >= ?",
      [monthStart]
    );
    const pendapatanKotor = parseFloat(pendapatan[0].total);

    // 3. Total HPP Bulan Ini = SUM(Debit HPP) WHERE month = current
    const [hpp]: any = await pool.query(
      "SELECT COALESCE(SUM(nominal), 0) as total FROM keuangan_jurnal WHERE tipe_akun = 'HPP' AND posisi = 'Debit' AND tanggal >= ?",
      [monthStart]
    );
    const totalHPP = parseFloat(hpp[0].total);

    // 4. Laba Bersih = Pendapatan - HPP
    const labaBersih = pendapatanKotor - totalHPP;

    res.json({
      success: true,
      data: {
        total_aset_persediaan: totalAsetPersediaan,
        pendapatan_kotor: pendapatanKotor,
        total_hpp: totalHPP,
        laba_bersih: labaBersih
      }
    });
  } catch (error: any) {
    console.error('[getKPI] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};
