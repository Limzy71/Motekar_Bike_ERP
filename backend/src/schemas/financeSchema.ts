import { z } from 'zod';

export const createInvoiceSchema = z.object({
  body: z.object({
    no_tagihan_vendor: z.string().min(1, 'Nomor Tagihan wajib diisi!'),
    id_po_header: z.number(),
    id_penerimaan: z.number(),
    tanggal_tagihan: z.string().min(1, 'Tanggal tagihan wajib diisi!'),
    jatuh_tempo: z.string().min(1, 'Jatuh tempo wajib diisi!'),
    total_tagihan: z.number().min(0, 'Total tagihan harus angka positif!'),
  })
});

export const paymentSchema = z.object({
  body: z.object({
    id_tagihan: z.number(),
    tanggal_bayar: z.string().min(1, 'Tanggal bayar wajib diisi!'),
    nominal_bayar: z.number().min(1, 'Nominal bayar harus lebih dari 0!'),
    metode_bayar: z.string().min(1, 'Metode bayar wajib diisi!'),
    referensi_transaksi: z.string().optional(),
  })
});
