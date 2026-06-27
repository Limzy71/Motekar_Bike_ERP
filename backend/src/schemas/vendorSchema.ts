import { z } from 'zod';

export const createVendorSchema = z.object({
  body: z.object({
    nama_vendor: z.string().min(1, 'Nama vendor tidak boleh kosong!'),
    kode_vendor: z.string().optional(),
    kategori: z.string().optional(),
    kontak: z.string().optional(),
    alamat: z.string().optional(),
  }),
});

export const updateVendorStatusSchema = z.object({
  body: z.object({
    status_vendor: z.enum(['AKTIF', 'INAKTIF', 'BLACKLIST']),
    skor_rating: z.number().min(1).max(5).optional(),
    alasan_blacklist: z.string().optional(),
  }).superRefine((data, ctx) => {
    // Jika BLACKLIST, alasan wajib diisi
    if (data.status_vendor === 'BLACKLIST' && (!data.alasan_blacklist || data.alasan_blacklist.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alasan blacklist wajib diisi jika status adalah BLACKLIST!',
        path: ['alasan_blacklist'],
      });
    }
  }),
});
