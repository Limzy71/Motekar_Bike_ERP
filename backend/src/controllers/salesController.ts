import { Request, Response } from 'express';
import pool from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../helpers/asyncHandler.js';
import { createSOSchema } from '../schemas/salesSchema.js';
import { ZodError } from 'zod';

export const getSalesOrders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.query(`
    SELECT so.id, so.no_so, so.nama_customer, so.tanggal_order, so.total_harga, so.status,
           (SELECT COUNT(*) FROM sales_order_detail WHERE so_id = so.id) as total_items
    FROM sales_order so
    ORDER BY so.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

export const createSalesOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = createSOSchema.parse({ body: req.body });
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let totalHargaSO = 0;

      // 1. Validasi Stok Gudang (Inventory Validation Guard)
      for (const item of validatedData.body.items) {
        const [stokRows]: any = await connection.query(
          'SELECT nama_barang, jumlah_stok, harga_jual FROM inventory_stok WHERE id = ? FOR UPDATE',
          [item.barang_id]
        );

        if (stokRows.length === 0) {
          throw new AppError('Barang tidak ditemukan (ID: ' + item.barang_id + ').', 404);
        }

        const barang = stokRows[0];
        if (item.qty_order > barang.jumlah_stok) {
          throw new AppError('Stok tidak mencukupi untuk barang ' + barang.nama_barang + '. Diminta: ' + item.qty_order + ', Tersedia: ' + barang.jumlah_stok, 400);
        }

        totalHargaSO += (parseFloat(barang.harga_jual) * item.qty_order);
      }

      // 2. Generate No SO
      const [countResult]: any = await connection.query('SELECT COUNT(*) as count FROM sales_order');
      const soNumber = 'SO-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(countResult[0].count + 1).padStart(4, '0');

      // 3. Insert Header SO
      const [soResult]: any = await connection.query(
        'INSERT INTO sales_order (no_so, nama_customer, tanggal_order, total_harga, status) VALUES (?, ?, ?, ?, ?)',
        [soNumber, validatedData.body.nama_customer, validatedData.body.tanggal_target_kirim, totalHargaSO, 'DRAFT']
      );

      const soId = soResult.insertId;

      // 4. Insert Detail SO (ambil harga_jual fresh dari DB)
      for (const item of validatedData.body.items) {
        const [barangRows]: any = await connection.query('SELECT harga_jual FROM inventory_stok WHERE id = ?', [item.barang_id]);
        const hargaSatuan = parseFloat(barangRows[0].harga_jual);

        await connection.query(
          'INSERT INTO sales_order_detail (so_id, barang_id, qty_order, harga_satuan) VALUES (?, ?, ?, ?)',
          [soId, item.barang_id, item.qty_order, hargaSatuan]
        );

        // Note: Stok belum dipotong di sini. Stok dipotong saat proses pengiriman/Shipping.
        // Jika perlu mem-booking stok (stok_committed), bisa di-update di sini.
        await connection.query(
          'UPDATE inventory_stok SET stok_committed = stok_committed + ? WHERE id = ?',
          [item.qty_order, item.barang_id]
        );
      }

      await connection.commit();
      res.status(201).json({ success: true, message: 'Sales Order berhasil dibuat.', data: { no_so: soNumber } });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    if (error instanceof ZodError) {
      throw new AppError((error as any).errors.map((e: any) => e.message).join(', '), 400);
    }
    throw error;
  }
});

export const shipSalesOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const soId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [soRows]: any = await connection.query('SELECT status, no_so FROM sales_order WHERE id = ? FOR UPDATE', [soId]);
    if (soRows.length === 0) {
      throw new AppError('Sales Order tidak ditemukan.', 404);
    }

    if (soRows[0].status !== 'APPROVED' && soRows[0].status !== 'DRAFT') { // usually SHIPPED from APPROVED, but let's allow DRAFT for now if they don't have approval workflow
      // throw new AppError('SO ini tidak dapat dikirim karena statusnya ' + soRows[0].status, 400);
    }

    const [items]: any = await connection.query('SELECT barang_id, qty_order FROM sales_order_detail WHERE so_id = ?', [soId]);
    
    for (const item of items) {
      await connection.query(
        'UPDATE inventory_stok SET jumlah_stok = jumlah_stok - ?, stok_committed = stok_committed - ? WHERE id = ?',
        [item.qty_order, item.qty_order, item.barang_id]
      );
    }

    await connection.query('UPDATE sales_order SET status = ? WHERE id = ?', ['SHIPPED', soId]);
    
    await connection.commit();
    res.json({ success: true, message: `SO ${soRows[0].no_so} berhasil dikirim.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const deliverSalesOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const soId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [soRows]: any = await connection.query('SELECT status, no_so, total_harga FROM sales_order WHERE id = ? FOR UPDATE', [soId]);
    if (soRows.length === 0) {
      throw new AppError('Sales Order tidak ditemukan.', 404);
    }

    if (soRows[0].status !== 'SHIPPED') {
      throw new AppError('SO ini tidak dapat dideliver karena statusnya ' + soRows[0].status, 400);
    }

    const file = req.file;
    if (!file) {
      throw new AppError('Foto bukti terima (e-POD) wajib diunggah!', 400);
    }

    const foto_bukti_terima = file.filename;

    // 1. Update SO Status
    await connection.query('UPDATE sales_order SET status = ? WHERE id = ?', ['DELIVERED', soId]);

    // 2. Auto-Invoicing (AR Invoice)
    await connection.query(
      'INSERT INTO ar_invoice (so_id, total_tagihan, status_pembayaran, foto_bukti_terima) VALUES (?, ?, ?, ?)',
      [soId, soRows[0].total_harga, 'UNPAID', foto_bukti_terima]
    );

    await connection.commit();
    res.json({ success: true, message: `SO ${soRows[0].no_so} berhasil dideliver. Invoice otomatis terbit.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
