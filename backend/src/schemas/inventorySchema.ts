import { z } from 'zod';

export const goodsReceiptSchema = z.object({
  body: z.object({
    id_po_header: z.number(),
    penerima: z.string().min(1, 'Nama penerima tidak boleh kosong.'),
    surat_jalan_vendor: z.string().optional(),
    catatan: z.string().optional(),
    items: z.array(z.object({
      id_inventory_material: z.number(),
      qty_diterima: z.number().min(1, 'Qty diterima harus lebih dari 0!'),
      kondisi: z.enum(['BAIK', 'RUSAK'])
    })).min(1, 'Minimal satu barang harus diterima!')
  })
});
