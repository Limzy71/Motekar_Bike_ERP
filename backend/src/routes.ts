import { Router } from 'express';
import { login, refreshToken, logout } from './controllers/authController.js';
import { validateRequest } from './middlewares/validateRequest.js';
import { loginSchema } from './schemas/authSchema.js';
import { authenticate, requireRole } from './middlewares/authMiddleware.js';
import { upload } from './middlewares/upload.js';
import { getDashboard } from './controllers/dashboardController.js';
import { getAllPR, createPR, approvePR, bulkApprovePR, deletePR, bulkDeletePR, getVendors, getItems, createRestockRequest, getPendingRequests, completeRequest, getReorderAlerts, autoGeneratePR } from './controllers/pengadaanController.js';
import { generatePO, updatePOStatus, getAllPO, getPODetails, bulkGeneratePO, createDirectPO, deletePO, bulkReceivePO, bulkApprovePO, bulkIssuePO } from './controllers/poController.js';
import { getAllStok, stokMasuk, opnameStok, getPendingPO, getPendingPODetails, receiveGoods } from './controllers/gudangController.js';
import { getVendorsSRM, createVendor, updateVendor, updateVendorStatus } from './controllers/vendorController.js';
import { createVendorSchema, updateVendorStatusSchema } from './schemas/vendorSchema.js';
import { goodsReceiptSchema } from './schemas/inventorySchema.js';

const router = Router();

// Alias Auth untuk Jenderal
const executiveAuth = [authenticate, requireRole('Owner', 'General Manager')];

// Endpoint untuk login POST /api/login
router.post('/login', validateRequest(loginSchema), login);
router.post('/auth/refresh', refreshToken);
router.post('/auth/logout', logout);

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
router.post('/pengadaan/po/bulk-issue', poGeneralAuth, bulkIssuePO);
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
// MODUL PENGADAAN (SRM & VENDOR MANAGEMENT)
// ============================================================
router.get('/vendor', pengadaanStrictAuth, getVendorsSRM);
router.post('/vendor', pengadaanStrictAuth, validateRequest(createVendorSchema), createVendor);
router.put('/vendor/:id', pengadaanStrictAuth, validateRequest(createVendorSchema), updateVendor);
router.patch('/vendor/:id/status', pengadaanStrictAuth, validateRequest(updateVendorStatusSchema), updateVendorStatus);

// ============================================================
// MODUL GUDANG (Inventory Stok)
// Akses: Owner, General Manager, Gudang
// ============================================================
const gudangAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang')];
const gudangReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang', 'Operasi Inti', 'Kendali Mutu', 'Pengadaan')];

router.get('/gudang', gudangReadAuth, getAllStok);
router.post('/gudang/masuk', gudangAuth, stokMasuk);
router.patch('/gudang/opname/:id', gudangAuth, opnameStok);

// Goods Receipt Endpoints
router.get('/gudang/po-pending', gudangAuth, getPendingPO);
router.get('/gudang/po-pending/:id', gudangAuth, getPendingPODetails);
router.post('/gudang/receive', gudangAuth, upload.fields([{ name: 'foto_barang' }, { name: 'foto_surat_jalan' }, { name: 'foto_packaging' }]), receiveGoods);

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
import { getPendingReceipts, getAllInvoices, createInvoice, payInvoice } from './controllers/financeController.js';
import { createInvoiceSchema, paymentSchema } from './schemas/financeSchema.js';
const keuanganAuth = [authenticate, requireRole('Owner', 'General Manager', 'Keuangan & Akuntansi')];

router.get('/keuangan/jurnal', keuanganAuth, getAllJurnal);
router.get('/keuangan/kpi', keuanganAuth, getKPI);

// Accounts Payable
router.get('/finance/ap/pending-receipts', keuanganAuth, getPendingReceipts);
router.get('/finance/ap/invoices', keuanganAuth, getAllInvoices);
router.post('/finance/ap/invoice', keuanganAuth, validateRequest(createInvoiceSchema), createInvoice);
router.post('/finance/ap/pay', keuanganAuth, validateRequest(paymentSchema), payInvoice);

// ============================================================
// MODUL PENJUALAN (Order-to-Cash)
// ============================================================
import { getSalesOrders, createSalesOrder, shipSalesOrder, deliverSalesOrder } from './controllers/salesController.js';
import { createSOSchema } from './schemas/salesSchema.js';
const salesAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran & Penjualan')];
const logistikOutboundAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang')];

router.get('/sales/orders', salesAuth, getSalesOrders);
router.post('/sales/orders', salesAuth, validateRequest(createSOSchema), createSalesOrder);
router.patch('/sales/orders/:id/ship', logistikOutboundAuth, shipSalesOrder);
router.post('/sales/deliver/:id', logistikOutboundAuth, upload.single('foto_bukti_terima'), deliverSalesOrder);

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

// Log Audit & System Settings
const auditAuth = [authenticate, requireRole('Owner', 'IT Support', 'General Manager', 'Legal & Kepatuhan')];
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

const pemasaranAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran & Penjualan')];

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

const klaimReadAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran & Penjualan', 'Kendali Mutu')];
const klaimWritePemasaranAuth = [authenticate, requireRole('Owner', 'Pemasaran & Penjualan')];
const klaimInvestigateAuth = [authenticate, requireRole('Owner', 'Kendali Mutu')];

router.post('/aftersales/klaim', klaimWritePemasaranAuth, createKlaim);
router.get('/aftersales/klaim', klaimReadAuth, getAllKlaim);
router.patch('/aftersales/klaim/:id/investigate', klaimInvestigateAuth, investigateKlaim);

// ============================================================
// MODUL EXCEPTION HANDLING & KENDALI DARURAT
// ============================================================
import { submitRTV, reportFailedDelivery, rescheduleDelivery, submitWriteOff, approveWriteOff, getWriteOffs } from './controllers/exceptionController.js';

const exceptionAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang', 'Kendali Mutu')];
const logistikAuth = [authenticate, requireRole('Owner', 'General Manager', 'Gudang', 'Pemasaran & Penjualan')];

router.post('/exception/rtv', exceptionAuth, submitRTV);
router.patch('/exception/so/:id/failed-delivery', logistikAuth, reportFailedDelivery);
router.patch('/exception/so/:id/reschedule', logistikAuth, rescheduleDelivery);
router.post('/exception/writeoff', exceptionAuth, upload.single('bukti_berita_acara'), submitWriteOff);
router.patch('/exception/writeoff/:id/approve', executiveAuth, approveWriteOff);
router.get('/exception/writeoff', exceptionAuth, getWriteOffs);

// ============================================================
// MODUL CRM & AFTER-SALES
// ============================================================
import { submitOnboarding, verifyProspect, getProspects, submitWarrantyClaim, getWarrantyClaims, investigateWarrantyClaim } from './controllers/crmController.js';

const crmAuth = [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran & Penjualan')];

// Onboarding
router.get('/crm/onboarding', crmAuth, getProspects);
router.post('/crm/onboarding', upload.single('dokumen_nib'), crmAuth, submitOnboarding);
router.post('/crm/onboarding/:id/verify', crmAuth, verifyProspect);

// Warranty
router.get('/crm/warranty', [authenticate, requireRole('Owner', 'General Manager', 'Pemasaran & Penjualan', 'Kendali Mutu')], getWarrantyClaims);
router.post('/crm/warranty/claim', upload.single('foto_kerusakan'), crmAuth, submitWarrantyClaim);
router.patch('/crm/warranty/:id/investigate', [authenticate, requireRole('Owner', 'Kendali Mutu')], investigateWarrantyClaim);

export default router;

