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

      // 2. BACKFLUSHING ENGINE: Ambil alokasi WIP material dari operasi_wo_material_allocation
      const [allocations]: any = await connection.query('SELECT * FROM operasi_wo_material_allocation WHERE id_wo_header = ?', [woId]);
      
      for (const alloc of allocations) {
          if (alloc.status_alokasi === 'Reserved') {
              await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.qty_kebutuhan, alloc.id_inventory_material]);
              await connection.query('UPDATE operasi_wo_material_allocation SET status_alokasi = "Consumed" WHERE id = ?', [alloc.id]);
          }
      }

      // 3. Tambah stok gudang (Barang Jadi)
      await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE id = ?', [wo.jumlah_produksi, wo.id_inventory_fg]);

      // 4. AUTOMATED FINANCIAL LEDGER — Jurnal Kapitalisasi Manufaktur (WIP ke FG)
      const [fgData]: any = await connection.query('SELECT harga_standar FROM inventory_stok WHERE id = ?', [wo.id_inventory_fg]);
      const hargaStandar = parseFloat(fgData[0]?.harga_standar || 0);
      const totalKapitalisasi = hargaStandar * wo.jumlah_produksi;

      // Ambil nomor WO untuk referensi dokumen
      const [woRef]: any = await connection.query('SELECT nomor_wo FROM operasi_wo_header WHERE id = ?', [woId]);
      const refDoc = woRef.length > 0 ? woRef[0].nomor_wo : `WO-${woId}`;

      if (totalKapitalisasi > 0) {
        await insertJurnal(connection, refDoc, `Kapitalisasi WIP ke Finished Good (${wo.jumlah_produksi} Unit)`, 'Aset_Persediaan', 'Debit', totalKapitalisasi);
        await insertJurnal(connection, refDoc, `Pelepasan nilai WIP untuk FG`, 'Aset_Persediaan', 'Kredit', totalKapitalisasi);
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
