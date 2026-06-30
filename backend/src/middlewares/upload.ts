import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Tentukan sub-folder secara dinamis berdasarkan nama field dari request
        let subDir = 'lainnya';
        const field = file.fieldname;
        
        if (field === 'dokumen_nib') {
            subDir = 'crm/onboarding';
        } else if (field === 'foto_kerusakan') {
            subDir = 'crm/warranty';
        } else if (field === 'foto_bukti_terima') {
            subDir = 'epod/sales';
        } else if (field === 'foto_serah_terima_3pl') {
            subDir = 'epod/ship';
        } else if (['foto_barang', 'foto_surat_jalan', 'foto_packaging'].includes(field)) {
            subDir = 'gudang/receive';
        } else if (field === 'bukti_berita_acara') {
            subDir = 'exception/writeoff';
        }

        const uploadDir = path.join(process.cwd(), 'public/uploads', subDir);
        
        // Pastikan folder exist secara dinamis
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const upload = multer({ storage });
