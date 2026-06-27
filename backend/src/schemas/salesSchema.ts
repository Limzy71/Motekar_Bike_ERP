import { z } from 'zod';

export const createSOSchema = z.object({
  nama_customer: z.string().min(1, "Nama Customer harus diisi."),
  tanggal_order: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Format tanggal tidak valid",
  }),
  items: z.array(
    z.object({
      barang_id: z.number().positive("Barang ID harus valid"),
      qty_order: z.number().positive("Qty harus lebih dari 0")
    })
  ).min(1, "Minimal 1 item harus dipesan.")
});
