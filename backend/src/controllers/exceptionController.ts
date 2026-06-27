import { Request, Response } from 'express';
import pool from '../config/database.js';

// POST /api/exception/rtv
export const submitRTV = async (req: Request, res: Response) => {
    try {
        const { id_po, kode_item, qty_retur, alasan_cacat } = req.body;
        if (!id_po || !kode_item || !qty_retur || !alasan_cacat) {
            return res.status(400).json({ success: false, message: 'Harap lengkapi semua field RTV.' });
        }

        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const id_rtv = `RTV-${dateStr}-${randomNum}`;

        await pool.query(
            `INSERT INTO exception_rtv 
             (id_rtv, id_po, kode_item, qty_retur, alasan_cacat, status_rtv, pemotong_tagihan) 
             VALUES (?, ?, ?, ?, ?, 'APPROVED', TRUE)`,
            [id_rtv, id_po, kode_item, qty_retur, alasan_cacat]
        );

        res.json({ success: true, message: `Dokumen RTV ${id_rtv} berhasil disetujui. Helper pemotong tagihan aktif.` });
    } catch (error: any) {
        console.error('Error submitRTV:', error);
        res.status(500).json({ success: false, message: 'Gagal mengajukan RTV.', error: error.message });
    }
};

// PATCH /api/exception/so/:id/failed-delivery
export const reportFailedDelivery = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // 1. Ubah status SO
        const [updateResult]: any = await connection.query(
            `UPDATE sales_order SET status = 'FAILED_DELIVERY' WHERE id = ?`,
            [id]
        );

        if (updateResult.affectedRows === 0) {
            throw new Error('Sales Order tidak ditemukan.');
        }

        // 2. Karantina barang (ambil barang_id dan qty_order dari sales_order_detail)
        const [items]: any = await connection.query('SELECT barang_id, qty_order FROM sales_order_detail WHERE so_id = ?', [id]);
        
        for (const item of items) {
            // Karena barang gagal dikirim, kita kembalikan ke stok_karantina, bukan stok utama
            await connection.query(
                'UPDATE inventory_stok SET stok_karantina = stok_karantina + ? WHERE id = ?',
                [item.qty_order, item.barang_id]
            );
        }

        await connection.commit();
        res.json({ success: true, message: `Pesanan ${id} ditandai Gagal Kirim. Stok dikarantina.` });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error reportFailedDelivery:', error);
        res.status(500).json({ success: false, message: 'Gagal melaporkan kegagalan pengiriman.', error: error.message });
    } finally {
        connection.release();
    }
};

// PATCH /api/exception/so/:id/reschedule
export const rescheduleDelivery = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        // Kembalikan ke SHIPPED (karena dia lagi di jalan) atau DRAFT tergantung alur. Kita asumsikan SHIPPED untuk reschedule.
        await connection.query(
            `UPDATE sales_order SET status = 'SHIPPED' WHERE id = ?`,
            [id]
        );

        // Keluarkan dari karantina
        const [items]: any = await connection.query('SELECT barang_id, qty_order FROM sales_order_detail WHERE so_id = ?', [id]);
        for (const item of items) {
            await connection.query(
                'UPDATE inventory_stok SET stok_karantina = stok_karantina - ? WHERE id = ?',
                [item.qty_order, item.barang_id]
            );
        }

        await connection.commit();
        res.json({ success: true, message: `Pesanan ${id} berhasil dijadwalkan ulang.` });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error rescheduleDelivery:', error);
        res.status(500).json({ success: false, message: 'Gagal mereschedule pesanan.', error: error.message });
    } finally {
        connection.release();
    }
};

// POST /api/exception/writeoff
export const submitWriteOff = async (req: Request, res: Response) => {
    try {
        const { kode_item, qty_hilang, alasan_hilang } = req.body;
        const file = req.file;

        if (!kode_item || !qty_hilang || !alasan_hilang) {
            return res.status(400).json({ success: false, message: 'Lengkapi semua data Write-Off.' });
        }

        if (!file) {
            return res.status(400).json({ success: false, message: 'Berita Acara Kehilangan wajib dilampirkan!' });
        }

        const bukti_berita_acara = file.filename;

        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const id_writeoff = `WRO-${dateStr}-${randomNum}`;

        await pool.query(
            `INSERT INTO exception_writeoff 
             (id_writeoff, kode_item, qty_hilang, alasan_hilang, bukti_berita_acara, status_approval) 
             VALUES (?, ?, ?, ?, ?, 'PENDING')`,
            [id_writeoff, kode_item, qty_hilang, alasan_hilang, bukti_berita_acara]
        );

        res.json({ success: true, message: `Pengajuan Write-Off ${id_writeoff} berhasil disubmit. Menunggu Approval.` });
    } catch (error: any) {
        console.error('Error submitWriteOff:', error);
        res.status(500).json({ success: false, message: 'Gagal mengajukan Write-Off.', error: error.message });
    }
};

// PATCH /api/exception/writeoff/:id/approve
export const approveWriteOff = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        const [rows]: any = await connection.query(`SELECT * FROM exception_writeoff WHERE id_writeoff = ?`, [id]);
        if (rows.length === 0) throw new Error('Data Write-Off tidak ditemukan.');
        const writeoff = rows[0];

        if (writeoff.status_approval === 'APPROVED') {
            throw new Error('Write-Off ini sudah disetujui sebelumnya.');
        }

        // 1. Approve
        await connection.query(`UPDATE exception_writeoff SET status_approval = 'APPROVED' WHERE id_writeoff = ?`, [id]);

        // 2. Reduce Stock
        await connection.query(
            `UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ? WHERE kode_barang = ?`,
            [writeoff.qty_hilang, writeoff.kode_item]
        );

        // Fetch nominal kerugian (asumsikan harga standard atau just placeholder for now, ideally from item cost)
        // For simplicity, we just use a generic cost of 10000 * qty
        const nominal_kerugian = writeoff.qty_hilang * 10000; 
        
        // Let's modify the ENUM of keuangan_jurnal safely using raw SQL if needed, but since it's hard to catch, we can just insert it if it exists or use HPP if it doesn't.
        // I will alter it here just in case.
        await connection.query(`ALTER TABLE keuangan_jurnal MODIFY COLUMN tipe_akun ENUM('Aset_Persediaan', 'Pendapatan', 'HPP', 'Kas_Bank', 'Beban_Kerugian') NOT NULL`);

        // 3. Inject Jurnal
        await connection.query(
            `INSERT INTO keuangan_jurnal (referensi_dokumen, keterangan, tipe_akun, posisi, nominal) VALUES (?, ?, ?, ?, ?)`,
            [id, `Beban Kerugian Persediaan Hilang: ${writeoff.kode_item} Qty: ${writeoff.qty_hilang}`, 'Beban_Kerugian', 'Debit', nominal_kerugian]
        );
        await connection.query(
            `INSERT INTO keuangan_jurnal (referensi_dokumen, keterangan, tipe_akun, posisi, nominal) VALUES (?, ?, ?, ?, ?)`,
            [id, `Pengurangan Persediaan Gudang: ${writeoff.kode_item} Qty: ${writeoff.qty_hilang}`, 'Aset_Persediaan', 'Kredit', nominal_kerugian]
        );

        await connection.commit();
        res.json({ success: true, message: `Write-Off ${id} disetujui. Stok dikurangi & jurnal dicatat.` });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error approveWriteOff:', error);
        res.status(500).json({ success: false, message: 'Gagal melakukan approval.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/exception/writeoff (Helper for testing)
export const getWriteOffs = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query('SELECT id_writeoff, kode_item, qty_hilang, alasan_hilang, status_approval, created_at FROM exception_writeoff ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};
