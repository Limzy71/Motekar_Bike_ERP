import { Request, Response } from 'express';
import pool from '../config/database.js';
import { calculateHPP, insertJurnal } from './keuanganController.js';

/**
 * Controller untuk Modul Kendali Mutu (ISO 4210 QC Gateway).
 */

export const submitInspeksi = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const { id, result, defectNotes, qcHistory } = req.body;

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

    // Ambil data WO saat ini (dari arsitektur Header-Detail)
    const [woData]: any = await connection.query(
      `SELECT w.id, w.jumlah_produksi, w.status, w.id_inventory_fg, i.kode_barang as kode_sepeda, i.nama_barang
       FROM operasi_wo_header w
       JOIN inventory_stok i ON w.id_inventory_fg = i.id
       WHERE w.id = ?`,
      [woId]
    );

    if (woData.length === 0) {
      res.status(404).json({ success: false, message: 'Work Order tidak ditemukan.' });
      connection.release();
      return;
    }

    const wo = woData[0];

    // Pastikan WO berada di tahap yang valid (Selesai Perakitan -> Masuk QC)
    if (wo.status !== 'TUNING_QC') {
      res.status(400).json({ success: false, message: `Work Order berstatus ${wo.status}, hanya WO berstatus TUNING_QC yang bisa diinspeksi.` });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    if (result === 'Pass') {
      // SKENARIO A: LOLOS QC
      // 1. Ubah status menjadi 'COMPLETED' dan bersihkan data rework/qc
      await connection.query(
        "UPDATE operasi_wo_header SET status = 'COMPLETED', catatan_rework = NULL, qc_history = NULL WHERE id = ?",
        [woId]
      );

      // 2. BACKFLUSHING ENGINE: Ambil resep komponen dari master_bom
      const [bomRows]: any = await connection.query(
        'SELECT komponen_id, qty_dibutuhkan FROM master_bom WHERE barang_jadi_id = ?',
        [wo.id_inventory_fg]
      );
      
      for (const bom of bomRows) {
        const totalKebutuhan = bom.qty_dibutuhkan * wo.jumlah_produksi;
        
        // Cek stok komponen di WIP dengan Pessimistic Lock
        const [kompRows]: any = await connection.query(
          'SELECT jumlah_stok, nama_barang, lokasi FROM inventory_stok WHERE id = ? FOR UPDATE',
          [bom.komponen_id]
        );

        if (kompRows.length === 0) {
          throw new Error(`Komponen dengan ID ${bom.komponen_id} tidak ditemukan di gudang.`);
        }
        
        const komponen = kompRows[0];
        if (komponen.jumlah_stok < totalKebutuhan) {
          throw new Error(`Stok komponen ${komponen.nama_barang} tidak mencukupi di ${komponen.lokasi}! Butuh: ${totalKebutuhan}, Tersedia: ${komponen.jumlah_stok}`);
        }

        // Kurangi stok (Backflush)
        await connection.query(
          'UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ? WHERE id = ?',
          [totalKebutuhan, bom.komponen_id]
        );
      }

      // 3. Tambah stok gudang (Barang Jadi)
      const [stokUpdateResult]: any = await connection.query(
        'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE kode_barang = ?',
        [wo.jumlah_produksi, wo.kode_sepeda]
      );

      if (stokUpdateResult.affectedRows === 0) {
        throw new Error(`Kode Sepeda ${wo.kode_sepeda} tidak ditemukan di master gudang.`);
      }

      // 4. AUTOMATED FINANCIAL LEDGER — Catat jurnal HPP masuk ke Aset Persediaan
      const hppPerUnit = await calculateHPP(connection, wo.kode_sepeda);
      const totalNilaiHPP = hppPerUnit * wo.jumlah_produksi;

      // Ambil nomor WO untuk referensi dokumen
      const [woRef]: any = await connection.query('SELECT nomor_wo FROM operasi_wo_header WHERE id = ?', [woId]);
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

      // 1. Ubah status mundur ke 'Sub-Assembly' dan update catatan serta riwayat QC
      await connection.query(
        "UPDATE operasi_wo_header SET status = 'SUB_ASSEMBLY', catatan_rework = ?, qc_history = ? WHERE id = ?",
        [newNotes, qcHistory ? JSON.stringify(qcHistory) : null, woId]
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
