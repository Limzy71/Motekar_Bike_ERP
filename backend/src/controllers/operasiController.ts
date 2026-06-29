import { Request, Response } from 'express';
import pool from '../config/database.js';
import { logAudit } from '../helpers/auditHelper.js';
import { insertJurnal } from './keuanganController.js';

// ============================================================
// [GET] /api/operasi/wo — Ambil semua Work Order
// ============================================================
export const getAllWO = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        wo.id, wo.nomor_wo, wo.jumlah_produksi, wo.status, wo.created_at, wo.catatan_rework, wo.qc_history, wo.target_selesai,
        fg.nama_barang as produk, fg.kode_barang
      FROM operasi_wo_header wo
      JOIN inventory_stok fg ON wo.id_inventory_fg = fg.id
      ORDER BY wo.created_at DESC
    `);
    
    // Get allocations for BOM Checklist and check pending deficits
    for (const wo of rows) {
        const [allocations]: any = await pool.query(`
            SELECT 
                a.qty_kebutuhan, a.status_alokasi,
                comp.nama_barang, comp.kode_barang, 
                comp.jumlah_stok, comp.stok_committed
            FROM operasi_wo_material_allocation a
            JOIN inventory_stok comp ON a.id_inventory_material = comp.id
            WHERE a.id_wo_header = ?
        `, [wo.id]);
        wo.materials = allocations;

        const [pendingReqs]: any = await pool.query(`
            SELECT id FROM pengadaan_restock_requests 
            WHERE nomor_wo = ? AND status = 'Pending'
        `, [wo.nomor_wo]);
        
        wo.has_pending_deficit = pendingReqs.length > 0;
    }

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export async function resolveAllocations(connection: any, parentCode: string, qtyMultiplier: number, level: number = 0): Promise<any[]> {
    const [bomRows]: any = await connection.query(`
        SELECT i.id as id_inventory_material, d.qty_kebutuhan, i.jumlah_stok, i.stok_committed, i.nama_barang, i.kode_barang, i.kategori, i.tipe_item
        FROM manufaktur_bom_detail d
        JOIN manufaktur_bom_header h ON d.id_bom = h.id_bom
        JOIN inventory_stok i ON d.kode_item_komponen = i.kode_barang
        WHERE h.kode_item_parent = ?
    `, [parentCode]);

    let finalAllocations: any[] = [];

    for (const item of bomRows) {
        const totalKebutuhan = item.qty_kebutuhan * qtyMultiplier;
        const stokTersedia = item.jumlah_stok - item.stok_committed;
        
        let allocQty = stokTersedia > 0 ? Math.min(stokTersedia, totalKebutuhan) : 0;
        let deficitQty = totalKebutuhan - allocQty;

        const isWip = item.tipe_item === 'SA' || item.kategori === 'WIP';

        if (isWip) {
            if (qtyMultiplier === 0) {
                // Visibility only
                finalAllocations.push({
                     ...item,
                     level,
                     is_phantom: false,
                     qty_allocated: 0,
                     total_kebutuhan: 0,
                     stok_tersedia: stokTersedia,
                     is_deficit: false,
                     deficit_amount: 0
                });
                const childrenAlloc = await resolveAllocations(connection, item.kode_barang, 0, level + 1);
                finalAllocations.push(...childrenAlloc);
            } else if (deficitQty > 0) {
                if (allocQty > 0) {
                     finalAllocations.push({
                         ...item,
                         level,
                         is_phantom: false,
                         qty_allocated: allocQty,
                         total_kebutuhan: totalKebutuhan,
                         stok_tersedia: stokTersedia,
                         is_deficit: false,
                         deficit_amount: 0
                     });
                }
                
                finalAllocations.push({
                     ...item,
                     level,
                     is_phantom: true,
                     qty_allocated: deficitQty,
                     total_kebutuhan: totalKebutuhan,
                     stok_tersedia: stokTersedia,
                     is_deficit: true,
                     deficit_amount: deficitQty
                });

                const childrenAlloc = await resolveAllocations(connection, item.kode_barang, deficitQty, level + 1);
                finalAllocations.push(...childrenAlloc);
            } else {
                finalAllocations.push({
                     ...item,
                     level,
                     is_phantom: false,
                     qty_allocated: totalKebutuhan,
                     total_kebutuhan: totalKebutuhan,
                     stok_tersedia: stokTersedia,
                     is_deficit: false,
                     deficit_amount: 0
                });

                const childrenAlloc = await resolveAllocations(connection, item.kode_barang, 0, level + 1);
                finalAllocations.push(...childrenAlloc);
            }
        } else {
            if (qtyMultiplier === 0) {
                 finalAllocations.push({
                     ...item,
                     level,
                     is_phantom: false,
                     qty_allocated: 0,
                     total_kebutuhan: 0,
                     stok_tersedia: stokTersedia,
                     is_deficit: false,
                     deficit_amount: 0
                 });
            } else {
                 if (allocQty > 0) {
                      finalAllocations.push({
                          ...item,
                          level,
                          is_phantom: false,
                          qty_allocated: allocQty,
                          total_kebutuhan: totalKebutuhan,
                          stok_tersedia: stokTersedia,
                          is_deficit: false,
                          deficit_amount: 0
                      });
                 }
                 if (deficitQty > 0) {
                      finalAllocations.push({
                          ...item,
                          level,
                          is_phantom: false,
                          qty_allocated: deficitQty,
                          total_kebutuhan: totalKebutuhan,
                          stok_tersedia: stokTersedia,
                          is_deficit: true,
                          deficit_amount: deficitQty
                      });
                 }
            }
        }
    }
    return finalAllocations;
}

export const createWO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { id_inventory_fg, jumlah_produksi } = req.body;
    const userId = (req as any).user?.id || 1;

    await connection.beginTransaction();

    const [fgRows]: any = await connection.query('SELECT kode_barang, nama_barang FROM inventory_stok WHERE id = ?', [id_inventory_fg]);
    if (fgRows.length === 0) throw new Error('Barang Jadi tidak ditemukan.');
    const fg = fgRows[0];

    const allocations = await resolveAllocations(connection, fg.kode_barang, jumlah_produksi);

    if (allocations.length === 0) throw new Error('BOM tidak ditemukan untuk produk ini.');

    const nomor_wo = `WO-${Date.now().toString().slice(-6)}`;
    const [woResult]: any = await connection.query(
      'INSERT INTO operasi_wo_header (nomor_wo, id_inventory_fg, jumlah_produksi, status) VALUES (?, ?, ?, ?)',
      [nomor_wo, id_inventory_fg, jumlah_produksi, 'DRAFT']
    );
    const woId = woResult.insertId;

    for (const alloc of allocations) {
      if (alloc.qty_allocated <= 0) continue;
      let statusAlokasi = alloc.is_phantom ? 'Phantom' : 'Reserved';
      await connection.query(
        'INSERT INTO operasi_wo_material_allocation (id_wo_header, id_inventory_material, qty_kebutuhan, status_alokasi) VALUES (?, ?, ?, ?)',
        [woId, alloc.id_inventory_material, alloc.qty_allocated, statusAlokasi]
      );
      
      if (!alloc.is_phantom) {
        await connection.query(
          'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
          [alloc.qty_allocated, alloc.id_inventory_material]
        );
      }
    }

    const hardDeficits = allocations.filter(a => a.is_deficit && !a.is_phantom);
    let restockMessage = '';
    if (hardDeficits.length > 0) {
        for (const def of hardDeficits) {
            await connection.query(
                'INSERT INTO pengadaan_restock_requests (id_inventory_material, nomor_wo, jumlah_diminta, status) VALUES (?, ?, ?, ?)',
                [def.id_inventory_material, nomor_wo, def.deficit_amount, 'Pending']
            );
        }
        restockMessage = ` (Peringatan: Ada Defisit Material, Request otomatis dikirim ke Pengadaan!)`;
    }

    await logAudit(userId, `Membuat WO Baru: ${nomor_wo} (Soft Reserve / Phantom BOM)`, req.ip, 'Success');
    await connection.commit();

    res.status(201).json({ success: true, message: `WO ${nomor_wo} berhasil dibuat (Status DRAFT).${restockMessage}` });
  } catch (error: any) {
    await connection.rollback();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

export const updateWOStatus = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const woId = req.params.id;
    const { status } = req.body; 
    const userId = (req as any).user?.id || 1;

    await connection.beginTransaction();

    const [woRows]: any = await connection.query('SELECT * FROM operasi_wo_header WHERE id = ? FOR UPDATE', [woId]);
    if (woRows.length === 0) throw new Error('Work Order tidak ditemukan.');
    const wo = woRows[0];
    const currentStatus = wo.status;

    const validStatuses = ['DRAFT', 'KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) throw new Error('Status tidak valid.');

    const [allocations]: any = await connection.query('SELECT * FROM operasi_wo_material_allocation WHERE id_wo_header = ?', [woId]);

    // DRAFT -> KITTING_RELEASED
    if (status === 'KITTING_RELEASED' && currentStatus === 'DRAFT') {
      // 1. Block kitting if there are unresolved material deficits (pending restock requests)
      const [pendingRequests]: any = await connection.query(
        "SELECT id FROM pengadaan_restock_requests WHERE nomor_wo = ? AND status = 'Pending'", 
        [wo.nomor_wo]
      );
      
      if (pendingRequests.length > 0) {
        throw new Error('Gagal Release Kitting! Masih ada defisit material. Harap selesaikan pengadaan material (PR/PO) terlebih dahulu.');
      }

      // 2. Direct warehouse stock check: ensure physical stock is sufficient for all reserved allocations
      const [deficits]: any = await connection.query(`
        SELECT comp.nama_barang, a.qty_kebutuhan, comp.jumlah_stok
        FROM operasi_wo_material_allocation a
        JOIN inventory_stok comp ON a.id_inventory_material = comp.id
        WHERE a.id_wo_header = ? AND a.status_alokasi = 'Reserved' AND comp.jumlah_stok < a.qty_kebutuhan
      `, [woId]);

      if (deficits.length > 0) {
        const itemNames = deficits.map((d: any) => `${d.nama_barang} (Butuh: ${d.qty_kebutuhan}, Stok: ${d.jumlah_stok})`).join(', ');
        throw new Error(`Gagal Release Kitting! Stok fisik tidak mencukupi untuk komponen: ${itemNames}. Silakan penuhi kebutuhan material terlebih dahulu.`);
      }

      await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
      await logAudit(userId, `WO ${wo.nomor_wo}: Kitting Released`, req.ip, 'Success');
    }
    
    // KITTING_RELEASED -> SUB_ASSEMBLY (Auto-Backflush RM, Produce Phantom WIP)
    else if (status === 'SUB_ASSEMBLY' && currentStatus === 'KITTING_RELEASED') {
      for (const alloc of allocations) {
          if (alloc.status_alokasi === 'Reserved') {
              const [itemRows]: any = await connection.query('SELECT tipe_item FROM inventory_stok WHERE id = ?', [alloc.id_inventory_material]);
              if (itemRows[0]?.tipe_item === 'RM') {
                  await connection.query('UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE id = ?', [alloc.qty_kebutuhan, alloc.qty_kebutuhan, alloc.id_inventory_material]);
                  await connection.query('UPDATE operasi_wo_material_allocation SET status_alokasi = "Consumed" WHERE id = ?', [alloc.id]);
              }
          } else if (alloc.status_alokasi === 'Phantom') {
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
      const [fgData]: any = await connection.query('SELECT harga_standar FROM inventory_stok WHERE id = ?', [wo.id_inventory_fg]);
      const hargaStandar = parseFloat(fgData[0]?.harga_standar || 0);
      const totalKapitalisasi = hargaStandar * wo.jumlah_produksi;
      
      if (totalKapitalisasi > 0) {
        await insertJurnal(connection, wo.nomor_wo, `Kapitalisasi Produk Jadi - ${wo.nomor_wo}`, 'Aset_Persediaan', 'Debit', totalKapitalisasi);
        await insertJurnal(connection, wo.nomor_wo, `Peleburan WIP ke Finished Goods - ${wo.nomor_wo}`, 'Aset_Persediaan', 'Kredit', totalKapitalisasi);
      }

      // Check if there is an associated Sales Order Detail (MTO backorder flow)
      const [soDetails]: any = await connection.query(
        'SELECT id, id_so_header FROM penjualan_so_detail WHERE id_wo_terkait = ?',
        [woId]
      );

      if (soDetails.length > 0) {
        for (const detail of soDetails) {
          // 1. Update the status of this item to 'TERSEDIA'
          await connection.query(
            'UPDATE penjualan_so_detail SET status_item = "TERSEDIA" WHERE id = ?',
            [detail.id]
          );

          // 2. Check if all items in this SO header are now 'TERSEDIA'
          const [allSoDetails]: any = await connection.query(
            'SELECT status_item FROM penjualan_so_detail WHERE id_so_header = ?',
            [detail.id_so_header]
          );
          
          const hasDefisit = allSoDetails.some((d: any) => d.status_item === 'DEFISIT');
          if (!hasDefisit) {
            // Update the SO status to 'RESERVED'
            await connection.query(
              'UPDATE penjualan_so_header SET status_so = "RESERVED" WHERE id = ?',
              [detail.id_so_header]
            );
          }
        }
      }

      // [MRP AUTO-RESTOCK] Delete any pending material requests related to this WO
      await connection.query('DELETE FROM pengadaan_restock_requests WHERE nomor_wo = ?', [wo.nomor_wo]);

      await connection.query('UPDATE operasi_wo_header SET status = ? WHERE id = ?', [status, woId]);
      await logAudit(userId, `WO ${wo.nomor_wo}: Completed (Backflush WIP -> FG) & Linked SO Updated`, req.ip, 'Success');
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
    } else {
      throw new Error(`Transisi status tidak valid: ${currentStatus} -> ${status}`);
    }

    await connection.commit();
    res.json({ success: true, message: `Status WO berhasil diubah menjadi ${status.replace('_', ' ')}.` });

  } catch (error: any) {
    await connection.rollback();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

export const getBOMExplosion = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { kode_sepeda, qty } = req.params;
    const jumlah_produksi = parseInt(qty, 10);

    const allocations = await resolveAllocations(connection, kode_sepeda, jumlah_produksi);
    
    res.json({ success: true, data: allocations });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
