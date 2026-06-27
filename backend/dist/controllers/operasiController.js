import pool from '../config/database.js';
import { logAudit } from '../helpers/auditHelper.js';
import { insertJurnal } from './keuanganController.js';
// ============================================================
// [GET] /api/operasi/wo — Ambil semua Work Order
// ============================================================
export const getAllWO = async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT 
        wo.id, wo.nomor_wo, wo.jumlah_produksi, wo.status, wo.created_at, wo.catatan_rework, wo.qc_history,
        fg.nama_barang as produk, fg.kode_barang
      FROM operasi_wo_header wo
      JOIN inventory_stok fg ON wo.id_inventory_fg = fg.id
      ORDER BY wo.created_at DESC
    `);
        // Get allocations for BOM Checklist
        for (const wo of rows) {
            const [allocations] = await pool.query(`
            SELECT 
                a.qty_kebutuhan, a.status_alokasi,
                comp.nama_barang, comp.kode_barang, 
                comp.jumlah_stok, comp.stok_committed
            FROM operasi_wo_material_allocation a
            JOIN inventory_stok comp ON a.id_inventory_material = comp.id
            WHERE a.id_wo_header = ?
        `, [wo.id]);
            wo.materials = allocations;
        }
        res.json({ success: true, data: rows });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
async function resolveAllocations(connection, parentCode, qtyMultiplier, level = 0) {
    const [bomRows] = await connection.query(`
        SELECT i.id as id_inventory_material, d.qty_kebutuhan, i.jumlah_stok, i.stok_committed, i.nama_barang, i.kode_barang, i.kategori, i.tipe_item
        FROM manufaktur_bom_detail d
        JOIN manufaktur_bom_header h ON d.id_bom = h.id_bom
        JOIN inventory_stok i ON d.kode_item_komponen = i.kode_barang
        WHERE h.kode_item_parent = ?
    `, [parentCode]);
    let finalAllocations = [];
    for (const item of bomRows) {
        const totalKebutuhan = item.qty_kebutuhan * qtyMultiplier;
        const stokTersedia = item.jumlah_stok - item.stok_committed;
        let allocQty = stokTersedia > 0 ? Math.min(stokTersedia, totalKebutuhan) : 0;
        let deficitQty = totalKebutuhan - allocQty;
        if (allocQty > 0) {
            finalAllocations.push({
                ...item,
                level,
                is_phantom: false,
                qty_allocated: allocQty,
                total_kebutuhan: allocQty,
                stok_tersedia: stokTersedia,
                is_deficit: false,
                deficit_amount: 0
            });
        }
        if (deficitQty > 0) {
            if (item.tipe_item === 'SA' || item.kategori === 'WIP') {
                finalAllocations.push({
                    ...item,
                    level,
                    is_phantom: true,
                    qty_allocated: deficitQty,
                    total_kebutuhan: deficitQty,
                    stok_tersedia: 0,
                    is_deficit: true,
                    deficit_amount: deficitQty
                });
                const childrenAlloc = await resolveAllocations(connection, item.kode_barang, deficitQty, level + 1);
                finalAllocations.push(...childrenAlloc);
            }
            else {
                finalAllocations.push({
                    ...item,
                    level,
                    is_phantom: false,
                    qty_allocated: deficitQty,
                    total_kebutuhan: deficitQty,
                    stok_tersedia: stokTersedia,
                    is_deficit: true,
                    deficit_amount: deficitQty
                });
            }
        }
    }
    return finalAllocations;
}
export const createWO = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_inventory_fg, jumlah_produksi } = req.body;
        const userId = req.user?.id || 1;
        await connection.beginTransaction();
        const [fgRows] = await connection.query('SELECT kode_barang, nama_barang FROM inventory_stok WHERE id = ?', [id_inventory_fg]);
        if (fgRows.length === 0)
            throw new Error('Barang Jadi tidak ditemukan.');
        const fg = fgRows[0];
        const allocations = await resolveAllocations(connection, fg.kode_barang, jumlah_produksi);
        if (allocations.length === 0)
            throw new Error('BOM tidak ditemukan untuk produk ini.');
        const nomor_wo = `WO-${Date.now().toString().slice(-6)}`;
        const [woResult] = await connection.query('INSERT INTO operasi_wo_header (nomor_wo, id_inventory_fg, jumlah_produksi, status) VALUES (?, ?, ?, ?)', [nomor_wo, id_inventory_fg, jumlah_produksi, 'DRAFT']);
        const woId = woResult.insertId;
        for (const alloc of allocations) {
            let statusAlokasi = alloc.is_phantom ? 'Phantom' : 'Reserved';
            await connection.query('INSERT INTO operasi_wo_material_allocation (id_wo_header, id_inventory_material, qty_kebutuhan, status_alokasi) VALUES (?, ?, ?, ?)', [woId, alloc.id_inventory_material, alloc.qty_allocated, statusAlokasi]);
            if (!alloc.is_phantom) {
                await connection.query('UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?', [alloc.qty_allocated, alloc.id_inventory_material]);
            }
        }
        // [AUTO-RESTOCK INTEGRATION] Handle hard deficits by generating restock requests automatically
        const hardDeficits = allocations.filter(a => a.is_deficit && !a.is_phantom);
        let restockMessage = '';
        if (hardDeficits.length > 0) {
            for (const def of hardDeficits) {
                await connection.query('INSERT INTO pengadaan_restock_requests (id_inventory_material, nomor_wo, jumlah_diminta, status) VALUES (?, ?, ?, ?)', [def.id_inventory_material, nomor_wo, def.deficit_amount, 'Pending']);
            }
            restockMessage = ` (Peringatan: Ada Defisit Material, Request otomatis dikirim ke Pengadaan!)`;
        }
        await logAudit(userId, `Membuat WO Baru: ${nomor_wo} (Soft Reserve / Phantom BOM)`, req.ip, 'Success');
        await connection.commit();
        res.status(201).json({ success: true, message: `WO ${nomor_wo} berhasil dibuat (Status DRAFT).${restockMessage}` });
    }
    catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    }
    finally {
        connection.release();
    }
};
export const updateWOStatus = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const woId = req.params.id;
        const { status } = req.body;
        const userId = req.user?.id || 1;
        await connection.beginTransaction();
        const [woRows] = await connection.query('SELECT * FROM operasi_wo_header WHERE id = ? FOR UPDATE', [woId]);
        if (woRows.length === 0)
            throw new Error('Work Order tidak ditemukan.');
        const wo = woRows[0];
        const currentStatus = wo.status;
        const validStatuses = ['DRAFT', 'KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC', 'COMPLETED', 'CANCELLED'];
        if (!validStatuses.includes(status))
            throw new Error('Status tidak valid.');
        const [allocations] = await connection.query('SELECT * FROM operasi_wo_material_allocation WHERE id_wo_header = ?', [woId]);
        // DRAFT -> KITTING_RELEASED
        if (status === 'KITTING_RELEASED' && currentStatus === 'DRAFT') {
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Kitting Released`, req.ip, 'Success');
        }
        // KITTING_RELEASED -> SUB_ASSEMBLY (Auto-Backflush RM, Produce Phantom WIP)
        else if (status === 'SUB_ASSEMBLY' && currentStatus === 'KITTING_RELEASED') {
            for (const alloc of allocations) {
                if (alloc.status_alokasi === 'Reserved') {
                    const [itemRows] = await connection.query('SELECT tipe_item FROM inventory_stok WHERE id = ?', [alloc.id_inventory_material]);
                    if (itemRows[0]?.tipe_item === 'RM') {
                        await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.qty_kebutuhan, alloc.id_inventory_material]);
                        await connection.query('UPDATE operasi_wo_material_allocation SET status_alokasi = "Consumed" WHERE id = ?', [alloc.id]);
                    }
                }
                else if (alloc.status_alokasi === 'Phantom') {
                    await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ?, stok_committed = stok_committed + ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.qty_kebutuhan, alloc.id_inventory_material]);
                    await connection.query('UPDATE operasi_wo_material_allocation SET status_alokasi = "Reserved" WHERE id = ?', [alloc.id]);
                }
            }
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Sub-Assembly (Backflush RM -> WIP)`, req.ip, 'Success');
        }
        // SUB_ASSEMBLY -> FINAL_ASSEMBLY
        else if (status === 'FINAL_ASSEMBLY' && currentStatus === 'SUB_ASSEMBLY') {
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Final Assembly`, req.ip, 'Success');
        }
        // FINAL_ASSEMBLY (or SUB_ASSEMBLY Rework) -> TUNING_QC
        else if (status === 'TUNING_QC' && (currentStatus === 'FINAL_ASSEMBLY' || currentStatus === 'SUB_ASSEMBLY')) {
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Tuning/QC`, req.ip, 'Success');
        }
        // TUNING_QC -> COMPLETED (Auto-Backflush WIP -> FG)
        else if (status === 'COMPLETED' && currentStatus === 'TUNING_QC') {
            for (const alloc of allocations) {
                if (alloc.status_alokasi === 'Reserved') {
                    await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.qty_kebutuhan, alloc.id_inventory_material]);
                    await connection.query('UPDATE operasi_wo_material_allocation SET status_alokasi = "Consumed" WHERE id = ?', [alloc.id]);
                }
            }
            await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok + ? WHERE id = ?', [wo.jumlah_produksi, wo.id_inventory_fg]);
            // JURNAL MANUFAKTUR (WIP to FG)
            const [fgData] = await connection.query('SELECT harga_standar FROM inventory_stok WHERE id = ?', [wo.id_inventory_fg]);
            const hargaStandar = parseFloat(fgData[0]?.harga_standar || 0);
            const totalKapitalisasi = hargaStandar * wo.jumlah_produksi;
            if (totalKapitalisasi > 0) {
                await insertJurnal(connection, wo.nomor_wo, `Kapitalisasi Produk Jadi - ${wo.nomor_wo}`, 'Aset_Persediaan', 'Debit', totalKapitalisasi);
                await insertJurnal(connection, wo.nomor_wo, `Peleburan WIP ke Finished Goods - ${wo.nomor_wo}`, 'Aset_Persediaan', 'Kredit', totalKapitalisasi);
            }
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Completed (Backflush WIP -> FG)`, req.ip, 'Success');
        }
        // TUNING_QC -> SUB_ASSEMBLY (Rework / QC Failed)
        else if (status === 'SUB_ASSEMBLY' && currentStatus === 'TUNING_QC') {
            await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Retur untuk Rework (QC Failed)`, req.ip, 'Warning');
        }
        // CANCELLED
        else if (status === 'CANCELLED' && (currentStatus === 'DRAFT' || currentStatus === 'KITTING_RELEASED')) {
            for (const alloc of allocations) {
                if (alloc.status_alokasi === 'Reserved') {
                    await connection.query('UPDATE inventory_stok SET stok_committed = stok_committed - ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.id_inventory_material]);
                }
            }
            await connection.query('DELETE FROM operasi_wo_material_allocation WHERE id_wo_header = ?', [woId]);
            // [MRP AUTO-RESTOCK] Delete any pending material requests related to this WO
            await connection.query('DELETE FROM pengadaan_restock_requests WHERE nomor_wo = ?', [wo.nomor_wo]);
            await connection.query('UPDATE operasi_wo_header SET status = "CANCELLED" WHERE id = ?', [woId]);
            await logAudit(userId, `WO ${wo.nomor_wo}: Dibatalkan (Release Reserve & Auto-Restock dihapus)`, req.ip, 'Warning');
        }
        else {
            throw new Error(`Transisi status tidak valid: ${currentStatus} -> ${status}`);
        }
        await connection.commit();
        res.json({ success: true, message: `Status WO berhasil diubah menjadi ${status.replace('_', ' ')}.` });
    }
    catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    }
    finally {
        connection.release();
    }
};
export const getBOMExplosion = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { kode_sepeda, qty } = req.params;
        const jumlah_produksi = parseInt(qty, 10);
        const allocations = await resolveAllocations(connection, kode_sepeda, jumlah_produksi);
        res.json({ success: true, data: allocations });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
    finally {
        connection.release();
    }
};
