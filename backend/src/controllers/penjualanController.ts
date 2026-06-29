import { Request, Response } from 'express';
import pool from '../config/database.js';
import { insertJurnal } from './keuanganController.js';
import { resolveAllocations } from './operasiController.js';

/**
 * Controller untuk Modul Penjualan & Penagihan (Order-to-Cash & Dual-Track Engine).
 * Architecture: penjualan_so_header + penjualan_so_detail
 */

// ============================================================
// [GET] /api/penjualan/products — FG items for Dropdown
// ============================================================
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      "SELECT id, kode_barang, nama_barang, harga_standar, jumlah_stok FROM inventory_stok WHERE tipe_item = 'FG' ORDER BY nama_barang ASC"
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// [GET] /api/penjualan/so — Ambil semua Sales Order
// ============================================================
export const getAllSO = async (req: Request, res: Response): Promise<void> => {
  try {
    // Self-healing check for completed linked WOs
    const [desyncedItems]: any = await pool.query(`
      SELECT d.id as id_detail, d.id_so_header, w.status as status_wo
      FROM penjualan_so_detail d
      JOIN operasi_wo_header w ON d.id_wo_terkait = w.id
      WHERE d.status_item = 'DEFISIT' AND w.status = 'COMPLETED'
    `);

    if (desyncedItems.length > 0) {
      for (const item of desyncedItems) {
        await pool.query(
          'UPDATE penjualan_so_detail SET status_item = "TERSEDIA" WHERE id = ?',
          [item.id_detail]
        );
        const [allDetails]: any = await pool.query(
          'SELECT status_item FROM penjualan_so_detail WHERE id_so_header = ?',
          [item.id_so_header]
        );
        const hasDefisit = allDetails.some((d: any) => d.status_item === 'DEFISIT' && d.id !== item.id_detail);
        if (!hasDefisit) {
          await pool.query(
            'UPDATE penjualan_so_header SET status_so = "RESERVED" WHERE id = ? AND status_so = "BACKORDER"',
            [item.id_so_header]
          );
        }
      }
    }

    const [headers]: any = await pool.query(`
      SELECT id, nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, catatan, biaya_pengiriman, status_so, total_nilai, foto_bukti_terima_retailer, created_at,
             vendor_3pl, nomor_resi_3pl, nama_supir, plat_nomor, no_telepon_supir
      FROM penjualan_so_header
      ORDER BY id DESC
    `);

    const [details]: any = await pool.query(`
      SELECT d.id, d.id_so_header, d.id_inventory_barang_jadi, d.qty,
             d.harga_satuan, d.subtotal, d.status_item, d.hpp_satuan_tercatat, d.id_wo_terkait,
             i.kode_barang, i.nama_barang, i.satuan
      FROM penjualan_so_detail d
      LEFT JOIN inventory_stok i ON d.id_inventory_barang_jadi = i.id
    `);

    const result = headers.map((h: any) => {
      const items = details.filter((d: any) => d.id_so_header === h.id);
      return {
        ...h,
        items
      };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[getAllSO] Error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ============================================================
// 1. [POST] /api/penjualan/so (Create SO & Stock Evaluator)
// ============================================================
export const createSO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const { nama_customer, alamat_pengiriman, tanggal_target_kirim, catatan, items, biaya_pengiriman, latitude, longitude } = req.body;

    if (!nama_customer || nama_customer.trim() === '') {
      res.status(400).json({ success: false, message: 'Nama Customer wajib diisi.' });
      connection.release();
      return;
    }

    if (!alamat_pengiriman) {
      res.status(400).json({ success: false, message: 'Alamat pengiriman wajib diisi.' });
      connection.release();
      return;
    }

    const ongkir = parseFloat(biaya_pengiriman);
    if (isNaN(ongkir) || ongkir < 0) {
      res.status(400).json({ success: false, message: 'Biaya Pengiriman (Ongkir) tidak valid atau minus.' });
      connection.release();
      return;
    }

    if (!tanggal_target_kirim || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: 'Data SO tidak lengkap. Pastikan tanggal target dan minimal 1 item diisi.' });
      connection.release();
      return;
    }

    await connection.beginTransaction();

    // Generate SO Number
    const [countRows]: any = await connection.query('SELECT COUNT(*) as count FROM penjualan_so_header');
    const soNumber = `SO-MTK-${new Date().getFullYear()}-${String(countRows[0].count + 1).padStart(4, '0')}`;

    // 1. Insert Header Draft first to get ID
    const [headerResult]: any = await connection.query(
      'INSERT INTO penjualan_so_header (nomor_so, nama_customer, alamat_pengiriman, tanggal_target_kirim, status_so, total_nilai, catatan, biaya_pengiriman, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [soNumber, nama_customer, alamat_pengiriman, tanggal_target_kirim, 'DRAFT', 0, catatan || null, ongkir, latitude || null, longitude || null]
    );
    const soHeaderId = headerResult.insertId;

    let hasDefisit = false;
    let grandTotal = ongkir;

    // 2. Evaluasi Stok & Insert Details
    for (const item of items) {
      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) throw new Error(`Jumlah qty tidak valid.`);

      const id_inventory = parseInt(item.id_inventory_barang_jadi, 10);
      if (isNaN(id_inventory)) throw new Error('ID Inventory tidak valid.');

      // Cek Stok Fisik & HPP
      const [stokData]: any = await connection.query(
        'SELECT jumlah_stok, stok_committed, harga_standar, harga_jual FROM inventory_stok WHERE id = ? FOR UPDATE',
        [id_inventory]
      );
      if (stokData.length === 0) throw new Error(`Barang FG dengan ID ${id_inventory} tidak ditemukan.`);

      const stokFisik = stokData[0].jumlah_stok;
      const stokCommitted = stokData[0].stok_committed || 0;
      const stokAvailable = stokFisik - stokCommitted;
      const hppSatuan = parseFloat(stokData[0].harga_standar || 0);
      
      // Jika Sales menginput harga custom, kita pakai. Jika tidak, pakai harga_jual dari master
      const hargaSatuan = parseFloat(item.harga_satuan) || parseFloat(stokData[0].harga_jual || stokData[0].harga_standar || 0);

      // --- PROFITABILITY GUARD (Hukum Besi Akuntansi) ---
      if (hargaSatuan < hppSatuan) {
         throw new Error(`Harga jual (Rp ${hargaSatuan.toLocaleString('id-ID')}) di bawah HPP (Rp ${hppSatuan.toLocaleString('id-ID')})! Transaksi berpotensi merugikan perusahaan.`);
      }

      const subtotal = hargaSatuan * qty;
      grandTotal += subtotal;

      let statusItem = 'TERSEDIA';
      if (stokAvailable < qty) {
        statusItem = 'DEFISIT';
        hasDefisit = true;
      } else {
        // [OPTION A] Reservasi Stok: Tambahkan ke stok_committed
        await connection.query(
          'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
          [qty, id_inventory]
        );
      }

      await connection.query(
        'INSERT INTO penjualan_so_detail (id_so_header, id_inventory_barang_jadi, qty, harga_satuan, subtotal, status_item, hpp_satuan_tercatat) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [soHeaderId, id_inventory, qty, hargaSatuan, subtotal, statusItem, hppSatuan]
      );
    }

    // 3. Update Status Header (RESERVED vs BACKORDER) & Total Nilai
    const finalStatus = hasDefisit ? 'BACKORDER' : 'RESERVED';
    await connection.query(
      'UPDATE penjualan_so_header SET status_so = ?, total_nilai = ? WHERE id = ?',
      [finalStatus, grandTotal, soHeaderId]
    );

    await connection.commit();
    res.status(201).json({ 
        success: true, 
        message: hasDefisit ? 'SO dibuat dengan status BACKORDER karena defisit stok.' : 'SO berhasil dibuat (RESERVED).',
        data: { id_so: soHeaderId, nomor_so: soNumber, status: finalStatus }
    });

  } catch (error: any) {
    await connection.rollback();
    console.error('[createSO] Transaction Error:', error);
    res.status(500).json({ success: false, message: `Gagal membuat SO: ${error.message}` });
  } finally {
    connection.release();
  }
};

// ============================================================
// 2. [POST] /api/penjualan/so/detail/:idDetail/trigger-wo (The Holy Grail Engine)
// ============================================================
export const triggerWO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const idDetail = parseInt(req.params.idDetail, 10);
    if (isNaN(idDetail)) throw new Error('ID Detail tidak valid.');

    await connection.beginTransaction();

    // 1. Get SO Detail and check status
    const [detailRows]: any = await connection.query(`
      SELECT d.id_so_header, d.id_inventory_barang_jadi, d.qty, d.status_item, d.id_wo_terkait,
             i.kode_barang, i.jumlah_stok,
             h.nomor_so, h.tanggal_target_kirim
      FROM penjualan_so_detail d
      JOIN inventory_stok i ON d.id_inventory_barang_jadi = i.id
      JOIN penjualan_so_header h ON d.id_so_header = h.id
      WHERE d.id = ? FOR UPDATE
    `, [idDetail]);

    if (detailRows.length === 0) throw new Error('Detail SO tidak ditemukan.');
    
    const detail = detailRows[0];
    if (detail.status_item !== 'DEFISIT') throw new Error('Barang ini sudah berstatus TERSEDIA, tidak perlu WO.');
    if (detail.id_wo_terkait !== null) throw new Error('Work Order sudah diterbitkan untuk defisit barang ini.');

    // Calculate defisit qty
    const selisihDefisit = detail.qty > detail.jumlah_stok ? detail.qty - detail.jumlah_stok : 0;
    if (selisihDefisit <= 0) throw new Error('Stok fisik saat ini cukup, tidak perlu Work Order. Silakan selaraskan data.');

    // Resolve allocations first to ensure BOM is valid and get components
    const allocations = await resolveAllocations(connection, detail.kode_barang, selisihDefisit);
    if (allocations.length === 0) throw new Error('BOM tidak ditemukan untuk produk ini.');

    // 2. Generate WO Number
    const woNumber = `WO-M${Date.now().toString().slice(-5)}`;

    // 3. Create Work Order in Modul 2 (operasi_wo_header)
    const [woResult]: any = await connection.query(
      'INSERT INTO operasi_wo_header (nomor_wo, id_inventory_fg, jumlah_produksi, status, target_selesai) VALUES (?, ?, ?, ?, ?)',
      [woNumber, detail.id_inventory_barang_jadi, selisihDefisit, 'DRAFT', detail.tanggal_target_kirim]
    );
    const woId = woResult.insertId;

    // Allocate materials
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

    // [AUTO-RESTOCK INTEGRATION] Handle hard deficits by generating restock requests automatically
    const hardDeficits = allocations.filter(a => a.is_deficit && !a.is_phantom);
    let restockMessage = '';
    if (hardDeficits.length > 0) {
        for (const def of hardDeficits) {
            await connection.query(
                'INSERT INTO pengadaan_restock_requests (id_inventory_material, nomor_wo, jumlah_diminta, status) VALUES (?, ?, ?, ?)',
                [def.id_inventory_material, woNumber, def.deficit_amount, 'Pending']
            );
        }
        restockMessage = ` (Peringatan: Ada Defisit Material, Request otomatis dikirim ke Pengadaan!)`;
    }

    // 4. Link WO to SO Detail
    await connection.query(
      'UPDATE penjualan_so_detail SET id_wo_terkait = ? WHERE id = ?',
      [woId, idDetail]
    );

    await connection.commit();
    res.json({ success: true, message: `Work Order Perakitan ${woNumber} berhasil diterbitkan ke MES.${restockMessage}` });

  } catch (error: any) {
    await connection.rollback();
    console.error('[triggerWO] Transaction Error:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// ============================================================
// 3. [PATCH] /api/penjualan/so/:id/fulfill (The Delivery & Hard Consume)
// ============================================================
export const fulfillSO = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const soId = parseInt(req.params.id, 10);
    const { action } = req.body; // action can be 'pay', 'report_failed'

    if (isNaN(soId)) throw new Error('ID SO tidak valid.');

    await connection.beginTransaction();

    // 1. Get SO Header
    const [headerRows]: any = await connection.query(
      'SELECT nomor_so, total_nilai, status_so, foto_bukti_terima_retailer FROM penjualan_so_header WHERE id = ? FOR UPDATE',
      [soId]
    );
    if (headerRows.length === 0) throw new Error('SO tidak ditemukan.');
    const soHeader = headerRows[0];

    // --- EXCEPTION HANDLING: FAILED DELIVERY ---
    if (action === 'report_failed') {
      if (soHeader.status_so !== 'SHIPPED') {
        throw new Error('Hanya pesanan yang sedang SHIPPED yang bisa dilaporkan FAILED_DELIVERY.');
      }
      
      // Update Status SO
      await connection.query(
        'UPDATE penjualan_so_header SET status_so = ? WHERE id = ?',
        ['FAILED_DELIVERY', soId]
      );

      // Note: Karena sistem Make-to-Stock/Order kita belum memotong stok fisik saat RESERVED (hanya status di SO),
      // Jika ingin melepaskan kuncian, kita asumsikan barang fisik dikembalikan ke 'Gudang Karantina'
      // Di sini kita catat logika pelepasan kuncian (soft-release):
      // (Bisa juga disinkronkan dengan status inventory_stok jika di masa depan ada kolom 'karantina')

      await connection.commit();
      res.json({ success: true, message: `Laporan Gagal Kirim diterima. SO menjadi FAILED_DELIVERY. Barang masuk antrean retur/karantina.` });
      return;
    }

    // --- NORMAL FULFILLMENT / PAY ---
    // Aturan: "No Photo, No Money" (Bab 2.3 & Bab 7)
    if (soHeader.status_so !== 'DELIVERED' || !soHeader.foto_bukti_terima_retailer) {
        await connection.rollback();
        res.status(422).json({ 
            success: false, 
            message: 'Compliance Error: Uang pelunasan baru bisa masuk ke Motekar SETELAH ada bukti fisik foto barang diterima oleh pembeli dan status DELIVERED.' 
        });
        return;
    }

    // 2. Check Detail Items "All-or-Nothing"
    const [detailRows]: any = await connection.query(
      'SELECT id, id_inventory_barang_jadi, qty, status_item, hpp_satuan_tercatat FROM penjualan_so_detail WHERE id_so_header = ?',
      [soId]
    );

    const isDefisit = detailRows.some((d: any) => d.status_item === 'DEFISIT');
    if (isDefisit) {
      throw new Error('All-or-Nothing Fulfillment Error: Masih ada baris detail yang berstatus DEFISIT. Harap tunggu WO diselesaikan.');
    }

    // 3. Hard Consume Stok
    for (const item of detailRows) {
      const [stokData]: any = await connection.query(
        'SELECT jumlah_stok FROM inventory_stok WHERE id = ? FOR UPDATE',
        [item.id_inventory_barang_jadi]
      );
      if (stokData[0].jumlah_stok < item.qty) {
        throw new Error(`Stok fisik untuk ID Barang ${item.id_inventory_barang_jadi} mendadak kurang dari qty SO!`);
      }

      await connection.query(
        'UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ? WHERE id = ?',
        [item.qty, item.id_inventory_barang_jadi]
      );
    }

    // 4. Update Status SO
    await connection.query(
      'UPDATE penjualan_so_header SET status_so = ? WHERE id = ?',
      ['PAID', soId] // After paid, eventually to COMPLETED. Here we set to PAID to reflect money received.
    );

    // 5. JURNAL AKUNTANSI PENJUALAN (4 Baris: Kas vs Pendapatan, HPP vs Persediaan)
    const totalPendapatan = parseFloat(soHeader.total_nilai || 0);
    if (totalPendapatan > 0) {
        await insertJurnal(connection, soHeader.nomor_so, `Pelunasan Piutang / Penjualan ${soHeader.nomor_so}`, 'Kas_Bank', 'Debit', totalPendapatan);
        await insertJurnal(connection, soHeader.nomor_so, `Pendapatan Operasional ${soHeader.nomor_so}`, 'Pendapatan', 'Kredit', totalPendapatan);
    }
    
    let totalHPP = 0;
    for (const item of detailRows) {
        totalHPP += parseFloat(item.hpp_satuan_tercatat || 0) * item.qty;
    }

    if (totalHPP > 0) {
        await insertJurnal(connection, soHeader.nomor_so, `Pengakuan HPP ${soHeader.nomor_so}`, 'HPP', 'Debit', totalHPP);
        await insertJurnal(connection, soHeader.nomor_so, `Pelepasan Persediaan ${soHeader.nomor_so}`, 'Aset_Persediaan', 'Kredit', totalHPP);
    }

    await connection.commit();
    res.json({ success: true, message: `Fulfillment sukses! Pembayaran divalidasi, stok di-hard consume dan SO berstatus PAID.` });

  } catch (error: any) {
    await connection.rollback();
    console.error('[fulfillSO] Transaction Error:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// ============================================================
// 4. [PATCH] /api/penjualan/so/:id/ship (Dispatch 3PL)
// ============================================================
export const shipSO = async (req: Request, res: Response): Promise<void> => {
  try {
    const soId = parseInt(req.params.id, 10);
    const { vendor, resi, foto, supir, plat, no_telepon } = req.body;
    
    if (isNaN(soId)) throw new Error('ID SO tidak valid.');
    
    const [headerRows]: any = await pool.query('SELECT status_so FROM penjualan_so_header WHERE id = ?', [soId]);
    if (headerRows.length === 0) throw new Error('SO tidak ditemukan.');
    if (headerRows[0].status_so !== 'RESERVED') throw new Error('Hanya pesanan berstatus RESERVED yang bisa di-dispatch.');

    await pool.query(
      'UPDATE penjualan_so_header SET status_so = ?, vendor_3pl = ?, nomor_resi_3pl = ?, foto_serah_terima_3pl = ?, nama_supir = ?, plat_nomor = ?, no_telepon_supir = ? WHERE id = ?',
      ['SHIPPED', vendor, resi, foto, supir, plat, no_telepon, soId]
    );

    res.json({ success: true, message: `Berhasil di-dispatch via ${vendor}. Status menjadi SHIPPED.` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================================
// 5. [PATCH] /api/penjualan/so/:id/deliver (POD Retailer)
// ============================================================
export const deliverSO = async (req: Request, res: Response): Promise<void> => {
  try {
    const soId = parseInt(req.params.id, 10);
    const file = req.file;
    
    if (isNaN(soId)) throw new Error('ID SO tidak valid.');
    if (!file) throw new Error('Foto bukti terima (POD) wajib diunggah!');
    
    const foto_pod = file.filename;
    
    const [headerRows]: any = await pool.query('SELECT status_so FROM penjualan_so_header WHERE id = ?', [soId]);
    if (headerRows.length === 0) throw new Error('SO tidak ditemukan.');
    if (headerRows[0].status_so !== 'SHIPPED') throw new Error('Hanya pesanan berstatus SHIPPED yang bisa dikonfirmasi DELIVERED.');

    await pool.query(
      'UPDATE penjualan_so_header SET status_so = ?, foto_bukti_terima_retailer = ? WHERE id = ?',
      ['DELIVERED', foto_pod, soId]
    );

    res.json({ success: true, message: `POD Retailer diunggah. Status menjadi DELIVERED.` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};
