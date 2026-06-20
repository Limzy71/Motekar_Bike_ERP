import { Request, Response } from 'express';
import pool from '../config/database.js';
import { calculateHPP, insertJurnal } from './keuanganController.js';

/**
 * Controller untuk Modul Kendali Mutu (ISO 4210 QC Gateway).
 */

export const submitInspeksi = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const { id, result, defectNotes } = req.body;

    const woId = parseInt(id, 10);
    if (isNaN(woId) || !result) {
      res.status(400).json({ success: false, message: 'ID atau Hasil Inspeksi tidak valid.' });
      connection.release();
      return;
    }

    if (result === 'Fail' && (!defectNotes || defectNotes.trim() === '')) {
      res.status(400).json({ success: false, message: 'Catatan defect wajib diisi untuk unit yang gagal QC.' });
      connection.release();
      return;
    }

    // Ambil data WO saat ini
    const [woData]: any = await connection.query(
      'SELECT id, kode_sepeda, jumlah_produksi, status, catatan_rework FROM operasi_wo WHERE id = ?',
      [woId]
    );

    if (woData.length === 0) {
      res.status(404).json({ success: false, message: 'Work Order tidak ditemukan.' });
      connection.release();
      return;
    }

    const wo = woData[0];

    // Pastikan WO berada di tahap yang valid (Selesai)
    if (wo.status !== 'Selesai') {
      res.status(400).json({ success: false, message: `Work Order berstatus ${wo.status}, bukan di tahap menunggu inspeksi.` });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    if (result === 'Pass') {
      // SKENARIO A: LOLOS QC
      // 1. Ubah status menjadi 'Closed'
      await connection.query(
        'UPDATE operasi_wo SET status = ? WHERE id = ?',
        ['Closed', woId]
      );

      // 2. Tambah stok gudang
      const [stokUpdateResult]: any = await connection.query(
        'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE kode_barang = ?',
        [wo.jumlah_produksi, wo.kode_sepeda]
      );

      if (stokUpdateResult.affectedRows === 0) {
        throw new Error(`Kode Sepeda ${wo.kode_sepeda} tidak ditemukan di master gudang.`);
      }

      // 3. AUTOMATED FINANCIAL LEDGER — Catat jurnal HPP masuk ke Aset Persediaan
      const hppPerUnit = await calculateHPP(connection, wo.kode_sepeda);
      const totalNilaiHPP = hppPerUnit * wo.jumlah_produksi;

      // Ambil nomor WO untuk referensi dokumen
      const [woRef]: any = await connection.query('SELECT nomor_wo FROM operasi_wo WHERE id = ?', [woId]);
      const refDoc = woRef.length > 0 ? woRef[0].nomor_wo : `WO-${woId}`;

      if (totalNilaiHPP > 0) {
        // Debit: Aset_Persediaan (barang masuk gudang senilai HPP)
        await insertJurnal(connection, refDoc, `Barang jadi masuk gudang via QC Pass (${wo.kode_sepeda} x${wo.jumlah_produksi})`, 'Aset_Persediaan', 'Debit', totalNilaiHPP);
        // Kredit: Kas_Bank (biaya perakitan yang terserap)
        await insertJurnal(connection, refDoc, `Biaya perakitan terserap untuk ${wo.kode_sepeda} x${wo.jumlah_produksi}`, 'Kas_Bank', 'Kredit', totalNilaiHPP);
      }

      await connection.commit();
      connection.release();
      res.json({ success: true, message: 'Inspeksi Pass. Work Order Closed, Stok & Jurnal Keuangan telah diperbarui.' });

    } else if (result === 'Fail') {
      // SKENARIO B: TOLAK / REWORK
      const dateStr = new Date().toLocaleDateString('id-ID');
      const formattedNote = `\n[ REWORK QC - ${dateStr} ] : ${defectNotes.trim()}`;
      
      const newNotes = wo.catatan_rework ? wo.catatan_rework + formattedNote : formattedNote.trim();

      // 1. Ubah status mundur ke 'Perakitan Frame' dan update catatan
      await connection.query(
        'UPDATE operasi_wo SET status = ?, catatan_rework = ? WHERE id = ?',
        ['Perakitan Frame', newNotes, woId]
      );

      await connection.commit();
      connection.release();
      res.json({ success: true, message: 'Inspeksi Fail. Work Order dikembalikan ke Perakitan Frame.' });

    } else {
      res.status(400).json({ success: false, message: 'Hasil inspeksi tidak valid.' });
      connection.release();
    }

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[submitInspeksi] Transaction Error:', error);
    res.status(500).json({ success: false, message: `Transaksi Gagal di-Rollback: ${error.message}` });
  }
};
