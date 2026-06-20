import { Router } from 'express';
import { login } from './controllers/authController.js';
import { authenticate, requireRole } from './middlewares/authMiddleware.js';
import { getDashboard } from './controllers/dashboardController.js';
import { getAllPR, createPR, approvePR, deletePR } from './controllers/pengadaanController.js';
import { getAllStok, stokMasuk, opnameStok } from './controllers/gudangController.js';

const router = Router();

// Endpoint untuk login POST /api/login
router.post('/login', login);

// Endpoint untuk dashboard GET /api/dashboard (memerlukan autentikasi)
router.get('/dashboard', authenticate, getDashboard);

// ============================================================
// MODUL PENGADAAN (Purchase Requisition)
// Akses: Owner, Admin, Pengadaan
// ============================================================
const pengadaanAuth = [authenticate, requireRole('Owner', 'Admin', 'Pengadaan')];

router.get('/pengadaan', pengadaanAuth, getAllPR);
router.post('/pengadaan', pengadaanAuth, createPR);
router.patch('/pengadaan/:id/approve', pengadaanAuth, approvePR);
router.delete('/pengadaan/:id', pengadaanAuth, deletePR);

// ============================================================
// MODUL GUDANG (Inventory Stok)
// Akses: Owner, Admin, Gudang
// ============================================================
const gudangAuth = [authenticate, requireRole('Owner', 'Admin', 'Gudang')];

router.get('/gudang', gudangAuth, getAllStok);
router.post('/gudang/masuk', gudangAuth, stokMasuk);
router.patch('/gudang/opname/:id', gudangAuth, opnameStok);

// ============================================================
// MODUL OPERASI INTI (Manufaktur & Perakitan)
// Akses: Owner, Admin, Operasi
// ============================================================
import { getAllWO, createWO, moveWO } from './controllers/operasiController.js';

const operasiAuth = [authenticate, requireRole('Owner', 'Admin', 'Operasi')];

router.get('/operasi/wo', operasiAuth, getAllWO);
router.post('/operasi/wo', operasiAuth, createWO);
router.patch('/operasi/wo/:id/move', operasiAuth, moveWO);

// ============================================================
// MODUL KENDALI MUTU (ISO 4210 QC Gateway)
// Akses: Owner, Admin, Kendali Mutu
// ============================================================
import { submitInspeksi } from './controllers/mutuController.js';

const mutuAuth = [authenticate, requireRole('Owner', 'Admin', 'Kendali Mutu')];

router.post('/mutu/inspeksi', mutuAuth, submitInspeksi);

// ============================================================
// MODUL PENJUALAN & PENAGIHAN (O2C & Soft Allocation)
// Akses: Owner, Admin, Penjualan & Penagihan
// ============================================================
import { getAllSO, createSO, confirmSO, shipSO } from './controllers/penjualanController.js';

const penjualanAuth = [authenticate, requireRole('Owner', 'Admin', 'Penjualan & Penagihan')];

router.get('/penjualan', penjualanAuth, getAllSO);
router.post('/penjualan', penjualanAuth, createSO);
router.patch('/penjualan/:id/confirm', penjualanAuth, confirmSO);
router.patch('/penjualan/:id/ship', penjualanAuth, shipSO);

// ============================================================
// MODUL MRP (Material Requirements Planning & BOM)
// Akses: Owner, Admin, Operasi Inti
// ============================================================
import { testExplodeBOM, executeMRP, getMasterBOM, getExplodableItems } from './controllers/mrpController.js';

const mrpAuth = [authenticate, requireRole('Owner', 'Admin', 'Operasi Inti')];

router.get('/mrp/bom', mrpAuth, getMasterBOM);
router.get('/mrp/items', mrpAuth, getExplodableItems);
router.post('/mrp/explode', mrpAuth, testExplodeBOM);
router.post('/mrp/execute', mrpAuth, executeMRP);

// ============================================================
// MODUL KEUANGAN & AKUNTANSI (Financial Ledger & HPP)
// Akses: Owner, Admin, Keuangan & Akuntansi
// ============================================================
import { getAllJurnal, getKPI } from './controllers/keuanganController.js';

const keuanganAuth = [authenticate, requireRole('Owner', 'Admin', 'Keuangan & Akuntansi')];

router.get('/keuangan/jurnal', keuanganAuth, getAllJurnal);
router.get('/keuangan/kpi', keuanganAuth, getKPI);

export default router;