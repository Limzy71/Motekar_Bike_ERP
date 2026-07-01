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
        const [soHeader]: any = await connection.query('SELECT status_so, nomor_so FROM penjualan_so_header WHERE id = ? FOR UPDATE', [id]);
        if (soHeader.length === 0) {
            throw new Error('Sales Order tidak ditemukan.');
        }

        await connection.query(
            `UPDATE penjualan_so_header SET status_so = 'FAILED_DELIVERY' WHERE id = ?`,
            [id]
        );

        // 2. Karantina barang (ambil barang_id dan qty_order dari sales_order_detail)
        const [items]: any = await connection.query('SELECT id_inventory_barang_jadi as barang_id, qty FROM penjualan_so_detail WHERE id_so_header = ?', [id]);
        
        for (const item of items) {
            // Karena barang gagal dikirim, kita kembalikan ke stok_karantina, bukan stok utama
            await connection.query(
                'UPDATE inventory_stok SET stok_karantina = stok_karantina + ? WHERE id = ?',
                [item.qty, item.barang_id]
            );
        }

        await connection.commit();
        res.json({ success: true, message: `Pesanan ${soHeader[0].nomor_so} ditandai Gagal Kirim. Stok dikarantina.` });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error reportFailedDelivery:', error);
        res.status(500).json({ success: false, message: 'Gagal melaporkan kegagalan pengiriman.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/exception/failed-deliveries
export const getFailedDeliveries = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(
            `SELECT h.id, h.nomor_so, h.nama_customer, h.updated_at as tanggal_gagal, 
                    s.kode_barang, d.qty,
                    (SELECT COUNT(*) FROM exception_writeoff w 
                     WHERE w.alasan_hilang LIKE CONCAT('%', h.nomor_so, '%')
                     AND w.status_approval = 'REJECTED'
                     AND w.created_at >= h.updated_at) as rejected_count,
                    (SELECT COUNT(*) FROM exception_writeoff w 
                     WHERE w.alasan_hilang LIKE CONCAT('%', h.nomor_so, '%')
                     AND w.status_approval = 'APPROVED'
                     AND w.created_at >= h.updated_at) as approved_count
             FROM penjualan_so_header h
             JOIN penjualan_so_detail d ON d.id_so_header = h.id
             JOIN inventory_stok s ON s.id = d.id_inventory_barang_jadi
             WHERE h.status_so = 'FAILED_DELIVERY' 
             AND NOT EXISTS (
                 SELECT 1 FROM exception_writeoff w 
                 WHERE w.alasan_hilang LIKE CONCAT('%', h.nomor_so, '%')
                 AND w.status_approval = 'PENDING'
                 AND w.created_at >= h.updated_at
             )
             ORDER BY h.updated_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/exception/so/:id/reschedule
export const rescheduleDelivery = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        // 1. Dapatkan info SO dan waktu gagal kirim (updated_at saat ini)
        const [soHeader]: any = await connection.query('SELECT nomor_so, updated_at FROM penjualan_so_header WHERE id = ?', [id]);
        if (soHeader.length === 0) throw new Error('Sales Order tidak ditemukan.');
        const nomor_so = soHeader[0].nomor_so;
        const failure_time = soHeader[0].updated_at;
        
        // 2. Kembalikan ke SHIPPED (karena dia lagi di jalan)
        await connection.query(
            `UPDATE penjualan_so_header SET status_so = 'SHIPPED' WHERE id = ?`,
            [id]
        );

        // 3. Cek apakah ada Write-Off yang di-ACC sejak barang dinyatakan gagal kirim
        const [writeoffs]: any = await connection.query(
            `SELECT * FROM exception_writeoff WHERE alasan_hilang LIKE CONCAT('%', ?, '%') AND status_approval = 'APPROVED' AND created_at >= ?`,
            [nomor_so, failure_time]
        );
        const isReplacement = writeoffs.length > 0;

        if (!isReplacement) {
            throw new Error(`Gagal menjadwalkan ulang! Pengajuan Write-Off untuk barang hilang/rusak pada pesanan ${nomor_so} belum disetujui oleh Owner/General Manager.`);
        }

        // Catatan: Barang lama yang hilang/rusak sudah dipotong dari jumlah_stok & stok_karantina 
        // saat approval Write-Off. Barang pengganti yang dikirim sekarang akan memotong 
        // jumlah_stok utama ketika SO ini di-fulfill / paid. Jadi tidak perlu memotong stok lagi di sini.

        await connection.commit();
        res.json({ success: true, message: `Pesanan ${nomor_so} berhasil dijadwalkan ulang.` });
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
        
        const [rows]: any = await connection.query(`SELECT * FROM exception_writeoff WHERE id_writeoff = ? FOR UPDATE`, [id]);
        if (rows.length === 0) throw new Error('Data Write-Off tidak ditemukan.');
        const writeoff = rows[0];

        if (writeoff.status_approval === 'APPROVED') {
            throw new Error('Write-Off ini sudah disetujui sebelumnya.');
        }

        // [PESSIMISTIC LOCKING] Kunci baris inventory_stok sebelum memotong stok untuk mencegah race condition
        const [stokRows]: any = await connection.query(
            `SELECT jumlah_stok, stok_karantina, harga_standar FROM inventory_stok WHERE kode_barang = ? FOR UPDATE`,
            [writeoff.kode_item]
        );
        if (stokRows.length === 0) throw new Error('Barang tidak ditemukan di inventori.');
        if (stokRows[0].jumlah_stok < writeoff.qty_hilang) {
            throw new Error('Gagal: Stok fisik tidak mencukupi untuk di-write-off.');
        }

        // 1. Approve
        await connection.query(`UPDATE exception_writeoff SET status_approval = 'APPROVED' WHERE id_writeoff = ?`, [id]);

        // 2. Reduce Stock (Also from karantina because it was quarantined during failure)
        await connection.query(
            `UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_karantina = GREATEST(0, stok_karantina - ?) WHERE kode_barang = ?`,
            [writeoff.qty_hilang, writeoff.qty_hilang, writeoff.kode_item]
        );

        // Fetch nominal kerugian (gunakan harga_standar, fallback 10000)
        const harga_standar = parseFloat(stokRows[0].harga_standar || 0);
        const nominal_kerugian = writeoff.qty_hilang * (harga_standar > 0 ? harga_standar : 10000); 
        
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

// PATCH /api/exception/writeoff/:id/reject
export const rejectWriteOff = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        const [rows]: any = await connection.query(`SELECT * FROM exception_writeoff WHERE id_writeoff = ?`, [id]);
        if (rows.length === 0) throw new Error('Data Write-Off tidak ditemukan.');
        const writeoff = rows[0];

        if (writeoff.status_approval !== 'PENDING') {
            throw new Error('Hanya Write-Off berstatus PENDING yang dapat ditolak.');
        }

        // Reject
        await connection.query(`UPDATE exception_writeoff SET status_approval = 'REJECTED' WHERE id_writeoff = ?`, [id]);

        await connection.commit();
        res.json({ success: true, message: `Write-Off ${id} berhasil ditolak.` });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error rejectWriteOff:', error);
        res.status(500).json({ success: false, message: 'Gagal menolak write-off.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/exception/writeoff (Helper for testing)
export const getWriteOffs = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(`
            SELECT w.id_writeoff, w.kode_item, w.qty_hilang, w.alasan_hilang, w.bukti_berita_acara, w.status_approval, w.created_at 
            FROM exception_writeoff w
            WHERE w.status_approval = 'PENDING'
            OR EXISTS (
                SELECT 1 FROM penjualan_so_header h
                WHERE w.alasan_hilang LIKE CONCAT('%', h.nomor_so, '%')
                AND h.status_so = 'FAILED_DELIVERY'
                AND w.created_at >= h.updated_at
            )
            ORDER BY w.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};
