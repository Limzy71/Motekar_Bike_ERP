import { Router } from 'express';
import { login } from './controllers/authController.js';
import { authenticate, requireRole } from './middlewares/authMiddleware.js';
import { getDashboard } from './controllers/dashboardController.js';
import { getAllPR, createPR, approvePR, bulkApprovePR, deletePR, bulkDeletePR, getVendors, getItems, createRestockRequest, getPendingRequests, completeRequest, getReorderAlerts, autoGeneratePR } from './controllers/pengadaanController.js';
import { generatePO, updatePOStatus, getAllPO, getPODetails, bulkGeneratePO, createDirectPO, deletePO, bulkReceivePO, bulkApprovePO } from './controllers/poController.js';
import { getAllStok, stokMasuk, opnameStok } from './controllers/gudangController.js';

const router = Router();

// Alias Auth untuk Jenderal
const executiveAuth = [authenticate, requireRole('Owner', 'General Manager')];

// Endpoint untuk login POST /api/login
router.post('/login', login);

// Endpoint untuk dashboard GET /api/dashboard (memerlukan autentikasi)
router.get('/dashboard', authenticate, getDashboard);

// ============================================================
// MODUL PENGADAAN (Purchase Requisition)
// Akses: Owner, General Manager, Pengadaan (Admin Dihapus)
// ============================================================
const pengadaanReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pengadaan', 'Operasi Inti')]; // IT Support dihapus sepenuhnya dari operational.
const pengadaanStrictAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pengadaan')];
const pengadaanReadStrictAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pengadaan', 'Operasi Inti')];

router.get('/pengadaan', pengadaanReadStrictAuth, getAllPR);
router.post('/pengadaan', pengadaanStrictAuth, createPR);
router.post('/pengadaan/pr/auto-generate', pengadaanStrictAuth, autoGeneratePR);
router.post('/pengadaan/pr/bulk-approve', executiveAuth, bulkApprovePR); // Executive Action
router.patch('/pengadaan/:id/approve', executiveAuth, approvePR); // Executive Action
router.delete('/pengadaan/:id', pengadaanStrictAuth, deletePR);
router.delete('/pengadaan', pengadaanStrictAuth, bulkDeletePR);
router.get('/pengadaan/vendors', pengadaanStrictAuth, getVendors);
router.get('/pengadaan/items', pengadaanStrictAuth, getItems);
router.get('/pengadaan/alerts', pengadaanStrictAuth, getReorderAlerts);

// Purchase Order (PO) Routes
const pengadaanWriteAuth = [authenticate, requireRole('Owner', 'Pengadaan')];
const poApprovalAuth = [authenticate, requireRole('Owner', 'General Manager')];
const poReceiveAuth = [authenticate, requireRole('Owner', 'Gudang')];
const poGeneralAuth = [authenticate]; // Actually handled in controller based on role
const poReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pengadaan', 'Operasi Inti', 'Gudang')];
router.get('/pengadaan/po', poReadAuth, getAllPO);
router.post('/pengadaan/po/direct', pengadaanWriteAuth, createDirectPO);
router.post('/pengadaan/po/bulk-receive', poGeneralAuth, bulkReceivePO); // Handled by controller logic
router.post('/pengadaan/po/bulk-approve', poApprovalAuth, bulkApprovePO); // Executive Action
router.delete('/pengadaan/po/:id', pengadaanWriteAuth, deletePO);
router.patch('/pengadaan/po/:id/status', authenticate, updatePOStatus); // RBAC handled inside controller for state transitions

// Legacy endpoints to prevent import errors during transition
router.get('/pengadaan/po/:id', pengadaanStrictAuth, getPODetails);
router.post('/pengadaan/po/generate/:id_pr', pengadaanStrictAuth, generatePO);
router.post('/pengadaan/po/bulk-generate', pengadaanStrictAuth, bulkGeneratePO);

// Restock requests dari Operasi
router.post('/pengadaan/requests', pengadaanReadStrictAuth, createRestockRequest);
router.get('/pengadaan/requests', pengadaanStrictAuth, getPendingRequests);
router.patch('/pengadaan/requests/:id', pengadaanStrictAuth, completeRequest);

// ============================================================
// MODUL GUDANG (Inventory Stok)
// Akses: Owner, General Manager, Gudang
// ============================================================
const gudangAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang')];
const gudangReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang', 'Operasi Inti', 'Kendali Mutu', 'Pengadaan')];

router.get('/gudang', gudangReadAuth, getAllStok);
router.post('/gudang/masuk', gudangAuth, stokMasuk);
router.patch('/gudang/opname/:id', gudangAuth, opnameStok);

// ============================================================
// MODUL OPERASI INTI (Manufaktur & Perakitan)
// Akses: Owner, General Manager, Operasi Inti
// ============================================================
import { getAllWO, createWO, updateWOStatus, getBOMExplosion } from './controllers/operasiController.js';

const operasiAuth = [authenticate, requireRole('Owner', 'General Manager', 'Operasi Inti')];
const operasiReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Operasi Inti', 'Kendali Mutu')];

router.get('/operasi/wo', operasiReadAuth, getAllWO);
router.get('/operasi/wo/bom-explosion/:kode_sepeda/:qty', operasiAuth, getBOMExplosion);
router.post('/operasi/wo', operasiAuth, createWO);
router.patch('/operasi/wo/:id/status', operasiAuth, updateWOStatus);

// ============================================================
// MODUL KENDALI MUTU (ISO 4210 QC Gateway)
// ============================================================
import { submitInspeksi } from './controllers/mutuController.js';

const mutuAuth = [authenticate, requireRole('Owner', 'General Manager', 'Kendali Mutu')];

router.post('/mutu/inspeksi', mutuAuth, submitInspeksi);

// ============================================================
// MODUL PENJUALAN & PENAGIHAN (O2C & Soft Allocation)
// ============================================================
import { getAllSO, createSO, triggerWO, fulfillSO, shipSO, deliverSO, getProducts } from './controllers/penjualanController.js';
import { calculateShipping } from './controllers/mapsController.js';

const penjualanAuth = [authenticate, requireRole('Owner', 'General Manager', 'Penjualan & Penagihan')];

router.post('/maps/calculate-shipping', penjualanAuth, calculateShipping);

router.get('/penjualan/so', penjualanAuth, getAllSO);
router.post('/penjualan/so', penjualanAuth, createSO);
router.post('/penjualan/so/detail/:idDetail/trigger-wo', penjualanAuth, triggerWO);
router.patch('/penjualan/so/:id/fulfill', penjualanAuth, fulfillSO);
router.patch('/penjualan/so/:id/ship', penjualanAuth, shipSO);
router.patch('/penjualan/so/:id/deliver', penjualanAuth, deliverSO);
router.get('/penjualan/products', penjualanAuth, getProducts);

// ============================================================
// MODUL MRP (Material Requirements Planning & BOM)
// ============================================================
import { testExplodeBOM, executeMRP, getMasterBOM, getExplodableItems, updateCosts } from './controllers/mrpController.js';

const mrpAuth = [authenticate, requireRole('Owner', 'General Manager', 'Operasi Inti')];

router.get('/mrp/bom', mrpAuth, getMasterBOM);
router.get('/mrp/items', mrpAuth, getExplodableItems);
router.post('/mrp/explode', mrpAuth, testExplodeBOM);
router.post('/mrp/execute', mrpAuth, executeMRP);
router.patch('/mrp/costs/:kode_barang', mrpAuth, updateCosts);

// ============================================================
// MODUL KEUANGAN & AKUNTANSI (Financial Ledger & HPP)
// ============================================================
import { getAllJurnal, getKPI } from './controllers/keuanganController.js';

const keuanganAuth = [authenticate, requireRole('Owner', 'General Manager', 'Keuangan & Akuntansi')];

router.get('/keuangan/jurnal', keuanganAuth, getAllJurnal);
router.get('/keuangan/kpi', keuanganAuth, getKPI);

// ============================================================
// MODUL PROFIL & USER MANAGEMENT
// IT Support hanya ada di sini.
// ============================================================
import { getMyProfile, changePassword, uploadAvatar, deleteAvatar, requestEmailChange, verifyEmailChange, testTelegram, getAuditLogs } from './controllers/profilController.js';

router.get('/profil/me', authenticate, getMyProfile);
router.patch('/profil/password', authenticate, changePassword);
router.post('/profil/avatar', authenticate, uploadAvatar);
router.delete('/profil/avatar', authenticate, deleteAvatar);
router.post('/profil/email/request', authenticate, requestEmailChange);
router.post('/profil/email/verify', authenticate, verifyEmailChange);
router.post('/profil/telegram/test', authenticate, testTelegram);

// Audit logs is technically System Maintenance. IT Support and Owner.
const auditAuth = [authenticate, requireRole('Owner', 'IT Support', 'General Manager')];
router.get('/profil/audit', auditAuth, getAuditLogs);

// Users CRUD (IT Support & Owner)
import { getAllUsers, createUser, updateUser, resetPassword } from './controllers/userController.js';

const userAuth = [authenticate, requireRole('Owner', 'General Manager', 'IT Support')];
router.get('/users', userAuth, getAllUsers);
router.post('/users', userAuth, createUser);
router.patch('/users/:id', userAuth, updateUser);
router.patch('/users/:id/reset-password', userAuth, resetPassword);

import { getITDashboardStats } from './controllers/itDashboardController.js';
router.get('/dashboard/it', userAuth, getITDashboardStats);

// ============================================================
// MODUL PEMASARAN B2B (CRM & Campaign Management)
// ============================================================
import { getAllCampaigns, createCampaign, updateCampaign, deleteCampaign, getAllLeads, createLead, updateLeadStatus, updateLead, deleteLead, getAktivitasByLead, createAktivitas, getPemasaranKPI } from './controllers/pemasaranController.js';

const pemasaranAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran')];

router.get('/pemasaran/campaigns', pemasaranAuth, getAllCampaigns);
router.post('/pemasaran/campaigns', pemasaranAuth, createCampaign);
router.patch('/pemasaran/campaigns/:id', pemasaranAuth, updateCampaign);
router.delete('/pemasaran/campaigns/:id', pemasaranAuth, deleteCampaign);

router.get('/pemasaran/leads', pemasaranAuth, getAllLeads);
router.post('/pemasaran/leads', pemasaranAuth, createLead);
router.patch('/pemasaran/leads/:id/status', pemasaranAuth, updateLeadStatus);
router.patch('/pemasaran/leads/:id', pemasaranAuth, updateLead);
router.delete('/pemasaran/leads/:id', pemasaranAuth, deleteLead);
router.get('/pemasaran/aktivitas/:id_lead', pemasaranAuth, getAktivitasByLead);
router.post('/pemasaran/aktivitas', pemasaranAuth, createAktivitas);
router.get('/pemasaran/kpi', pemasaranAuth, getPemasaranKPI);

// ============================================================
// MODUL KLAIM GARANSI & AFTER-SALES (CRM Modul 4)
// ============================================================
import { createKlaim, getAllKlaim, investigateKlaim } from './controllers/aftersalesController.js';

const klaimReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran', 'Kendali Mutu')];
const klaimWritePemasaranAuth = [authenticate, requireRole('Owner', 'Pemasaran')];
const klaimInvestigateAuth = [authenticate, requireRole('Owner', 'Kendali Mutu')];

router.post('/aftersales/klaim', klaimWritePemasaranAuth, createKlaim);
router.get('/aftersales/klaim', klaimReadAuth, getAllKlaim);
router.patch('/aftersales/klaim/:id/investigate', klaimInvestigateAuth, investigateKlaim);

export default router;