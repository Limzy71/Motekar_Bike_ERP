import { Request, Response } from 'express';
import pool from '../config/database.js';
import { logAudit } from '../helpers/auditHelper.js';

// ============================================================
// HELPER: Generate PO Number (Format: PO-MTK-YYMM-XXXX)
// ============================================================
export async function generatePONumber(connection: any): Promise<string> {
    const date = new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `PO-MTK-${yy}${mm}-`;

    const [rows]: any = await connection.query(
        `SELECT nomor_po FROM pengadaan_po_header WHERE nomor_po LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
    );

    let nextNum = 1;
    if (rows.length > 0) {
        const lastPO = rows[0].nomor_po;
        const lastSequence = parseInt(lastPO.split('-').pop() || '0', 10);
        nextNum = lastSequence + 1;
    }

    const sequence = nextNum.toString().padStart(4, '0');
    return `${prefix}${sequence}`;
}

// ============================================================
// [GET] /api/pengadaan/po — Get All PO (Header & Detail)
// ============================================================
export const getAllPO = async (req: Request, res: Response): Promise<void> => {
    try {
        const [headers]: any = await pool.query(`
            SELECT p.*, v.nama_vendor, v.alamat AS alamat_vendor, v.kontak AS kontak_vendor, pb.surat_jalan_vendor 
            FROM pengadaan_po_header p
            LEFT JOIN master_vendor v ON p.id_vendor = v.id
            LEFT JOIN penerimaan_barang pb ON pb.id_po_header = p.id
            ORDER BY p.created_at DESC
        `);

        for (const header of headers) {
            const [details]: any = await pool.query(`
                SELECT d.*, i.nama_barang, i.kode_barang, i.satuan
                FROM pengadaan_po_detail d
                JOIN inventory_stok i ON d.id_inventory_material = i.id
                WHERE d.id_po_header = ?
            `, [header.id]);
            header.items = details;
        }

        res.json({ success: true, data: headers });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================================
// [POST] /api/pengadaan/po/direct — Create New PO (DRAFT)
// ============================================================
export const createDirectPO = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id_vendor, items, catatan } = req.body;
        const userId = (req as any).user?.id || 1;

        if (!items || items.length === 0) {
            throw new Error('Minimal harus ada 1 item material.');
        }

        const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [id_vendor]);
        if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
            throw new Error(`Akses Ditolak: Vendor telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}`);
        }

        await connection.beginTransaction();

        const nomor_po = await generatePONumber(connection);
        
        let total_nilai = 0;
        const validItems = [];

        // Validate items and calculate total
        for (const item of items) {
            const qty = parseInt(item.qty, 10);
            const harga = parseFloat(item.harga_satuan);
            if (isNaN(qty) || qty <= 0 || isNaN(harga) || harga < 0) {
                throw new Error('Qty dan Harga harus valid dan lebih dari 0.');
            }
            total_nilai += (qty * harga);
            validItems.push({ id_inventory_material: item.id_inventory_material, qty, harga });
        }

        // Insert Header
        const [headerResult]: any = await connection.query(
            `INSERT INTO pengadaan_po_header (nomor_po, id_vendor, status, total_nilai, catatan) VALUES (?, ?, ?, ?, ?)`,
            [nomor_po, id_vendor, 'DRAFT', total_nilai, catatan]
        );
        const poId = headerResult.insertId;

        // Insert Details
        for (const item of validItems) {
            await connection.query(
                `INSERT INTO pengadaan_po_detail (id_po_header, id_inventory_material, qty, harga_satuan) VALUES (?, ?, ?, ?)`,
                [poId, item.id_inventory_material, item.qty, item.harga]
            );
        }

        await logAudit(userId, `Membuat PO Baru: ${nomor_po} (Direct)`, req.ip, 'Success');
        await connection.commit();

        res.status(201).json({ success: true, message: `PO ${nomor_po} berhasil dibuat sebagai DRAFT.` });
    } catch (error: any) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// [PATCH] /api/pengadaan/po/:id/status — PO State Machine & GRN
// ============================================================
export const updatePOStatus = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const poId = req.params.id;
        const { status } = req.body;
        const user = (req as any).user;
        const role = user?.divisi_role;

        await connection.beginTransaction();

        const [poRows]: any = await connection.query('SELECT * FROM pengadaan_po_header WHERE id = ? FOR UPDATE', [poId]);
        if (poRows.length === 0) throw new Error('Purchase Order tidak ditemukan.');
        const po = poRows[0];
        const currentStatus = po.status;

        // STATE TRANSITIONS & RBAC GUARDS
        
        // 1. DRAFT -> ISSUED (Pengadaan)
        if (status === 'ISSUED' && currentStatus === 'DRAFT') {
            if (role !== 'Pengadaan' && role !== 'Owner' && role !== 'General Manager') throw new Error('Akses ditolak: Hanya Pengadaan yang bisa mengajukan PO.');
            await connection.query('UPDATE pengadaan_po_header SET status = "ISSUED" WHERE id = ?', [poId]);
            await logAudit(user.id, `PO ${po.nomor_po}: Diajukan (ISSUED)`, req.ip, 'Success');

        // 2. ISSUED -> APPROVED / REJECTED (Executive)
        } else if ((status === 'APPROVED' || status === 'REJECTED') && currentStatus === 'ISSUED') {
            if (role !== 'General Manager' && role !== 'Owner') throw new Error('Akses ditolak: Hanya Executive yang bisa menyetujui/menolak PO.');
            await connection.query('UPDATE pengadaan_po_header SET status = ? WHERE id = ?', [status, poId]);
            await logAudit(user.id, `PO ${po.nomor_po}: ${status}`, req.ip, 'Success');

        // 2.5 ISSUED -> SENT_TO_VENDOR (Executive Fast-Track)
        } else if (status === 'SENT_TO_VENDOR' && currentStatus === 'ISSUED') {
            if (role !== 'General Manager' && role !== 'Owner') throw new Error('Akses ditolak: Hanya Executive yang bisa menyetujui PO.');
            await connection.query('UPDATE pengadaan_po_header SET status = "SENT_TO_VENDOR" WHERE id = ?', [poId]);
            await logAudit(user.id, `PO ${po.nomor_po}: Disetujui & Langsung Dikirim ke Vendor`, req.ip, 'Success');

        // 3. APPROVED -> SENT_TO_VENDOR (Pengadaan)
        } else if (status === 'SENT_TO_VENDOR' && currentStatus === 'APPROVED') {
            if (role !== 'Pengadaan' && role !== 'Owner' && role !== 'General Manager') throw new Error('Akses ditolak: Hanya Pengadaan yang bisa mengirim ke vendor.');
            await connection.query('UPDATE pengadaan_po_header SET status = "SENT_TO_VENDOR" WHERE id = ?', [poId]);
            await logAudit(user.id, `PO ${po.nomor_po}: Dikirim ke Vendor`, req.ip, 'Success');

        // 4. SENT_TO_VENDOR -> COMPLETED (GRN ENGINE) (Gudang)
        } else if (status === 'COMPLETED' && currentStatus === 'SENT_TO_VENDOR') {
            if (role !== 'Gudang' && role !== 'Owner' && role !== 'General Manager' && role !== 'Pengadaan') throw new Error('Akses ditolak: Hanya Gudang/Executive yang bisa menerima barang (GRN).');
            
            // Execute GRN (Goods Receipt Note): Update inventory_stok & create penerimaan record
            const [details]: any = await connection.query('SELECT id_inventory_material, qty FROM pengadaan_po_detail WHERE id_po_header = ?', [poId]);
            
            const [grInsert]: any = await connection.query(
                'INSERT INTO penerimaan_barang (id_po_header, penerima, surat_jalan_vendor, catatan) VALUES (?, ?, ?, ?)',
                [poId, user.nama || user.username || 'System', `SJ-${po.nomor_po.split('-').pop()}`, 'Auto-generated GRN via Sistem']
            );
            const grId = grInsert.insertId;

            for (const item of details) {
                await connection.query(
                    'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE id = ?',
                    [item.qty, item.id_inventory_material]
                );
                
                await connection.query(
                    'INSERT INTO detail_penerimaan (id_penerimaan, id_inventory_material, qty_diterima, kondisi) VALUES (?, ?, ?, ?)',
                    [grId, item.id_inventory_material, item.qty, 'BAIK']
                );
            }

            await connection.query('UPDATE pengadaan_po_header SET status = "COMPLETED" WHERE id = ?', [poId]);
            
            // Mark source PR as Selesai if linked
            if (po.id_pr) {
                await connection.query('UPDATE pengadaan_pr_header SET status_pr = "Selesai" WHERE id = ?', [po.id_pr]);
            }

            await logAudit(user.id, `PO ${po.nomor_po}: GRN Selesai (+${details.length} item)`, req.ip, 'Success');

        } else {
            throw new Error(`Transisi status tidak valid atau terlarang: ${currentStatus} -> ${status}`);
        }

        await connection.commit();
        res.json({ success: true, message: `Status PO berhasil diubah menjadi ${status}.` });

    } catch (error: any) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// LEGACY INTEGRATION: Generate PO dari PR
// ============================================================
export const getPODetails = async (req: Request, res: Response) => {
    // Dipindahkan ke list GET /api/pengadaan/po
    res.json({ success: false, message: 'Gunakan endpoint GET /api/pengadaan/po' });
};

export const generatePO = async (req: Request, res: Response): Promise<void> => {
    const { id_pr } = req.params;
    const userId = (req as any).user.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Dapatkan PR
        const [prs]: any = await connection.query('SELECT * FROM pengadaan_pr_header WHERE id = ?', [id_pr]);
        if (prs.length === 0) throw new Error('PR tidak ditemukan');
        const pr = prs[0];

        if (pr.status_pr === 'Selesai') throw new Error('Aksi Ditolak: PR ini sudah pernah di-generate menjadi PO sebelumnya!');
        if (pr.status_pr !== 'Diproses Vendor') throw new Error('Akses ditolak: PR belum disetujui untuk diproses (Status harus Diproses Vendor)');

        const [prDetails]: any = await connection.query('SELECT * FROM pengadaan_pr_detail WHERE id_pr_header = ?', [id_pr]);
        if (prDetails.length === 0) throw new Error('PR tidak memiliki item');

        const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [pr.id_vendor]);
        if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
            throw new Error(`Akses Ditolak: Vendor telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}`);
        }

        // 2. Generate Nomor PO
        const nomor_po = await generatePONumber(connection);

        // 3. Insert Header DRAFT
        const [poInsert]: any = await connection.query(
            'INSERT INTO pengadaan_po_header (nomor_po, id_vendor, status, catatan) VALUES (?, ?, ?, ?)',
            [nomor_po, pr.id_vendor, 'DRAFT', `Generated from PR ${pr.nomor_pr}`]
        );
        const poId = poInsert.insertId;

        // 4. Hitung Total & Insert Detail
        let total_nilai = 0;
        for (const detail of prDetails) {
            // Cari item di inventory_stok
            const [items]: any = await connection.query('SELECT id, harga_standar FROM inventory_stok WHERE kode_barang = ?', [detail.kode_barang]);
            let id_inventory = null;
            let harga = 0;
            if (items.length > 0) {
                id_inventory = items[0].id;
                harga = parseFloat(items[0].harga_standar || 0);
            } else {
                throw new Error(`Item ${detail.kode_barang} tidak ditemukan di master stok`);
            }

            const qty = detail.jumlah;
            total_nilai += (qty * harga);

            await connection.query(
                'INSERT INTO pengadaan_po_detail (id_po_header, id_inventory_material, qty, harga_satuan) VALUES (?, ?, ?, ?)',
                [poId, id_inventory, qty, harga]
            );
        }

        // 5. Update Total Nilai
        await connection.query('UPDATE pengadaan_po_header SET total_nilai = ? WHERE id = ?', [total_nilai, poId]);

        // 6. Update status PR
        await connection.query('UPDATE pengadaan_pr_header SET status_pr = ? WHERE id = ?', ['Selesai', id_pr]);

        await logAudit(userId, `Generate PO ${nomor_po} dari PR ${pr.nomor_pr}`, req.ip, 'Success');

        await connection.commit();
        res.status(201).json({ success: true, message: `PO ${nomor_po} berhasil digenerate sebagai DRAFT.` });

    } catch (error: any) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

export const bulkGeneratePO = async (req: Request, res: Response): Promise<void> => {
    // Ambil semua PR yang statusnya 'Diproses Vendor' dan generate PO
    const userId = (req as any).user.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [prs]: any = await connection.query('SELECT * FROM pengadaan_pr_header WHERE status_pr = ?', ['Diproses Vendor']);
        if (prs.length === 0) {
            res.status(404).json({ success: false, message: 'Tidak ada PR yang siap di-generate.' });
            return;
        }

        let generatedCount = 0;

        for (const pr of prs) {
            const [vendorCheck]: any = await connection.query('SELECT status_vendor, alasan_blacklist FROM master_vendor WHERE id = ?', [pr.id_vendor]);
            if (vendorCheck.length > 0 && vendorCheck[0].status_vendor === 'BLACKLIST') {
                throw new Error(`Akses Ditolak: Vendor ${pr.id_vendor} telah di-blacklist karena ${vendorCheck[0].alasan_blacklist}`);
            }

            const [prDetails]: any = await connection.query('SELECT * FROM pengadaan_pr_detail WHERE id_pr_header = ?', [pr.id]);
            if (prDetails.length === 0) continue;

            const nomor_po = await generatePONumber(connection);

            const [poInsert]: any = await connection.query(
                'INSERT INTO pengadaan_po_header (nomor_po, id_vendor, status, catatan) VALUES (?, ?, ?, ?)',
                [nomor_po, pr.id_vendor, 'DRAFT', `Bulk Generated from PR ${pr.nomor_pr}`]
            );
            const poId = poInsert.insertId;

            let total_nilai = 0;
            let validDetails = true;

            for (const detail of prDetails) {
                const [items]: any = await connection.query('SELECT id, harga_standar FROM inventory_stok WHERE kode_barang = ?', [detail.kode_barang]);
                if (items.length === 0) {
                    validDetails = false;
                    break;
                }
                const id_inventory = items[0].id;
                const harga = parseFloat(items[0].harga_standar || 0);
                const qty = detail.jumlah;
                total_nilai += (qty * harga);

                await connection.query(
                    'INSERT INTO pengadaan_po_detail (id_po_header, id_inventory_material, qty, harga_satuan) VALUES (?, ?, ?, ?)',
                    [poId, id_inventory, qty, harga]
                );
            }

            if (!validDetails) {
                throw new Error(`Data master stok tidak lengkap untuk PR ${pr.nomor_pr}`);
            }

            await connection.query('UPDATE pengadaan_po_header SET total_nilai = ? WHERE id = ?', [total_nilai, poId]);
            await connection.query('UPDATE pengadaan_pr_header SET status_pr = ? WHERE id = ?', ['Selesai', pr.id]);
            generatedCount++;
        }

        await logAudit(userId, `Bulk Generate ${generatedCount} PO dari PR`, req.ip, 'Success');

            await connection.commit();
        res.json({ success: true, message: `${generatedCount} PO berhasil di-generate sebagai DRAFT.` });

    } catch (error: any) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// [DELETE] /api/pengadaan/po/:id — Hapus PO
// ============================================================
export const deletePO = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const poId = req.params.id;
        const user = (req as any).user;
        const role = user?.divisi_role;

        if (role !== 'Owner' && role !== 'Pengadaan' && role !== 'General Manager') {
            throw new Error('Akses ditolak: Hanya Owner, General Manager, atau Pengadaan yang bisa menghapus PO.');
        }

        await connection.beginTransaction();

        const [poRows]: any = await connection.query('SELECT * FROM pengadaan_po_header WHERE id = ? FOR UPDATE', [poId]);
        if (poRows.length === 0) throw new Error('Purchase Order tidak ditemukan.');
        const po = poRows[0];

        if (po.status === 'COMPLETED') {
            throw new Error('Aksi Ditolak: PO yang sudah selesai (COMPLETED) tidak dapat dihapus karena barang sudah masuk gudang.');
        }

        // Kembalikan status PR asal jika ada
        if (po.catatan && po.catatan.includes('Generated from PR')) {
            const match = po.catatan.match(/PR\/MTK\/\d{4}\/\d+/);
            if (match) {
                const prNomor = match[0];
                await connection.query('UPDATE pengadaan_pr_header SET status_pr = "Diproses Vendor" WHERE nomor_pr = ?', [prNomor]);
            }
        }

        await connection.query('DELETE FROM pengadaan_po_header WHERE id = ?', [poId]);

        await logAudit(user.id, `Hapus PO ${po.nomor_po}`, req.ip, 'Success');

        await connection.commit();
        res.json({ success: true, message: `PO ${po.nomor_po} berhasil dihapus.` });

    } catch (error: any) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// [POST] /api/pengadaan/po/bulk-receive — Bulk Receive Items (GRN)
// ============================================================
export const bulkReceivePO = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    const user = (req as any).user;
    const role = user?.divisi_role;

    try {
        if (role !== 'General Manager' && role !== 'Owner' && role !== 'Pengadaan' && role !== 'Gudang') {
            throw new Error('Akses ditolak: Anda tidak memiliki izin untuk melakukan penerimaan barang massal dari halaman PO.');
        }

        await connection.beginTransaction();

        // Cari semua PO yang SENT_TO_VENDOR
        const [pos]: any = await connection.query('SELECT id, nomor_po, id_pr FROM pengadaan_po_header WHERE status = "SENT_TO_VENDOR"');
        
        if (pos.length === 0) {
            await connection.rollback();
            res.json({ success: false, message: 'Tidak ada Purchase Order yang menunggu penerimaan barang.' });
            return;
        }

        let count = 0;
        for (const po of pos) {
            // Execute GRN: Update inventory_stok & create penerimaan record
            const [details]: any = await connection.query('SELECT id_inventory_material, qty FROM pengadaan_po_detail WHERE id_po_header = ?', [po.id]);
            
            const [grInsert]: any = await connection.query(
                'INSERT INTO penerimaan_barang (id_po_header, penerima, surat_jalan_vendor, catatan) VALUES (?, ?, ?, ?)',
                [po.id, user.nama || user.username || 'System', `SJ-${po.nomor_po.split('-').pop()}`, 'Auto-generated Bulk GRN via Sistem']
            );
            const grId = grInsert.insertId;

            for (const item of details) {
                await connection.query(
                    'UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE id = ?',
                    [item.qty, item.id_inventory_material]
                );
                
                await connection.query(
                    'INSERT INTO detail_penerimaan (id_penerimaan, id_inventory_material, qty_diterima, kondisi) VALUES (?, ?, ?, ?)',
                    [grId, item.id_inventory_material, item.qty, 'BAIK']
                );
            }

            await connection.query('UPDATE pengadaan_po_header SET status = "COMPLETED" WHERE id = ?', [po.id]);
            
            // Mark source PR as Selesai if linked
            if (po.id_pr) {
                await connection.query('UPDATE pengadaan_pr_header SET status_pr = "Selesai" WHERE id = ?', [po.id_pr]);
            }

            await logAudit(user.id, `PO ${po.nomor_po}: Barang Diterima (GRN Massal)`, req.ip, 'Success');
            count++;
        }

        await connection.commit();
        res.json({ success: true, message: `${count} Purchase Order berhasil diterima secara massal.` });

    } catch (error: any) {
        await connection.rollback();
        console.error('[bulkReceivePO] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// [POST] /api/pengadaan/po/bulk-issue — Bulk Issue PO (DRAFT -> ISSUED)
// ============================================================
export const bulkIssuePO = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    const user = (req as any).user;
    const role = user?.divisi_role;

    try {
        if (role !== 'Pengadaan' && role !== 'Owner' && role !== 'General Manager') {
            throw new Error('Akses ditolak: Hanya Pengadaan atau Executive yang bisa mengajukan PO massal.');
        }

        await connection.beginTransaction();

        const [pos]: any = await connection.query('SELECT id, nomor_po FROM pengadaan_po_header WHERE status = "DRAFT"');
        
        if (pos.length === 0) {
            await connection.rollback();
            res.json({ success: false, message: 'Tidak ada Purchase Order (Draft) yang menunggu untuk diajukan.' });
            return;
        }

        let count = 0;
        for (const po of pos) {
            await connection.query('UPDATE pengadaan_po_header SET status = "ISSUED" WHERE id = ?', [po.id]);
            await logAudit(user.id, `PO ${po.nomor_po}: Diajukan Massal (ISSUED)`, req.ip, 'Success');
            count++;
        }

        await connection.commit();
        res.json({ success: true, message: `${count} Purchase Order berhasil diajukan secara massal (Status: ISSUED).` });

    } catch (error: any) {
        await connection.rollback();
        console.error('[bulkIssuePO] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ============================================================
// [POST] /api/pengadaan/po/bulk-approve — Bulk Approve PO (ISSUED -> SENT_TO_VENDOR)
// ============================================================
export const bulkApprovePO = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    const user = (req as any).user;
    const role = user?.divisi_role;

    try {
        if (role !== 'General Manager' && role !== 'Owner') {
            throw new Error('Akses ditolak: Hanya Executive yang bisa menyetujui PO massal.');
        }

        await connection.beginTransaction();

        const [pos]: any = await connection.query('SELECT id, nomor_po FROM pengadaan_po_header WHERE status = "ISSUED"');
        
        if (pos.length === 0) {
            await connection.rollback();
            res.json({ success: false, message: 'Tidak ada Purchase Order yang menunggu persetujuan.' });
            return;
        }

        let count = 0;
        for (const po of pos) {
            await connection.query('UPDATE pengadaan_po_header SET status = "SENT_TO_VENDOR" WHERE id = ?', [po.id]);
            await logAudit(user.id, `PO ${po.nomor_po}: Disetujui Massal & Dikirim ke Vendor`, req.ip, 'Success');
            count++;
        }

        await connection.commit();
        res.json({ success: true, message: `${count} Purchase Order berhasil disetujui secara massal dan dikirim ke vendor.` });

    } catch (error: any) {
        await connection.rollback();
        console.error('[bulkApprovePO] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};
