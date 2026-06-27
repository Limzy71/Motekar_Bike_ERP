import { z } from 'zod';

export const createPOSchema = z.object({
  body: z.object({
    id_vendor: z.number(),
    catatan: z.string().optional(),
    items: z.array(
      z.object({
        id_inventory_material: z.number(),
        qty: z.number().min(1, 'Quantity minimal 1'),
        harga_satuan: z.number().min(0, 'Harga tidak boleh negatif'),
      })
    ).min(1, 'Minimal satu item harus ditambahkan untuk membuat PO'),
  }),
});
