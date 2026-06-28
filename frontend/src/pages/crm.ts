import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';
import { renderPaginationUI } from '../utils/pagination.js';

let masterSO: any[] = [];
let currentUser: any = null;
let currentKlaimId: string | null = null;

let allOnboarding: any[] = [];
let onboardingCurrentPage = 1;
const onboardingPerPage = 10;

let allWarranty: any[] = [];
let warrantyCurrentPage = 1;
const warrantyPerPage = 10;

// ─── HELPERS ────────────────────────────────────────────────
function toast(msg: string, isError = false) {
    const el = document.getElementById('toast-crm');
    const msgEl = document.getElementById('toast-crm-msg');
    const iconEl = document.getElementById('toast-crm-icon');
    if (!el || !msgEl || !iconEl) return;
    msgEl.textContent = msg;
    iconEl.textContent = isError ? 'error' : 'check_circle';
    iconEl.className = `material-symbols-outlined text-[18px] ${isError ? 'text-rose-400' : 'text-emerald-400'}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
}

function openModal(id: string) {
    const modal = document.getElementById(id);
    const content = document.getElementById(id + '-content');
    if (modal && content) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
    }
}

function closeModal(id: string) {
    const modal = document.getElementById(id);
    const content = document.getElementById(id + '-content');
    if (modal && content) {
        modal.classList.add('opacity-0'); content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = initRBAC('nav-crm');
    if (!currentUser) return;

    const lastTab = (localStorage.getItem('crmLastTab') || 'onboarding') as 'onboarding' | 'warranty';
    (window as any).switchTab(lastTab);

    document.getElementById('anti-flicker')?.remove();

    setupModals();
    await loadSO();
    await loadOnboarding();
    if (lastTab === 'warranty') await loadWarranty();
});

// ─── LOAD SALES ORDERS ───────────────────────────────────────
async function loadSO() {
    try {
        // penjualan_so_header uses: id, no_so, status ('Draft'|'Confirmed'|'Shipped')
        // penjualan_so_detail uses: id_so_header, kode_barang, qty
        const res = await apiFetch<any>('penjualan/so');
        if (res.success) {
            // Ambil SO yang sudah Shipped (barang sudah diterima retailer) utk klaim garansi
            masterSO = (res.data || []).filter((s: any) =>
                ['Shipped', 'DELIVERED', 'PAID', 'Confirmed'].includes(s.status || s.status_so)
            );
        }
    } catch { /* silent */ }
}

// ─── ONBOARDING ──────────────────────────────────────────────
async function loadOnboarding() {
    const tbody = document.getElementById('onboarding-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400">Memuat...</td></tr>`;
    try {
        const res = await apiFetch<any>('crm/onboarding');
        if (res.success) {
            allOnboarding = res.data || [];
            onboardingCurrentPage = 1;
            renderOnboarding();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400 italic">Belum ada data prospek.</td></tr>`;
            renderPaginationUI('onboarding-pagination', 'onboarding-page-info', 1, 10, 0, () => {});
        }
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-500">Gagal memuat data.</td></tr>`;
    }
}

function renderOnboarding() {
    const tbody = document.getElementById('onboarding-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (allOnboarding.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400 italic">Belum ada data prospek.</td></tr>`;
        renderPaginationUI('onboarding-pagination', 'onboarding-page-info', 1, 10, 0, () => {});
        return;
    }
    
    const totalItems = allOnboarding.length;
    const totalPages = Math.ceil(totalItems / onboardingPerPage);
    if (onboardingCurrentPage < 1) onboardingCurrentPage = 1;
    if (onboardingCurrentPage > totalPages) onboardingCurrentPage = totalPages;
    
    const startIndex = (onboardingCurrentPage - 1) * onboardingPerPage;
    const currentItems = allOnboarding.slice(startIndex, startIndex + onboardingPerPage);
    
    currentItems.forEach((item: any) => {
        const statusMap: Record<string, string> = {
            'PROSPEK': 'bg-amber-50 text-amber-700 border-amber-200',
            'VERIFIED': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'REJECTED': 'bg-rose-50 text-rose-700 border-rose-200',
        };
        const badge = statusMap[item.status] || 'bg-slate-50 text-slate-600 border-slate-200';
        const canVerify = item.status === 'PROSPEK';
        const tr = document.createElement('tr');
        tr.className = `hover:bg-slate-50 transition-colors text-xs ${canVerify ? 'cursor-pointer' : ''}`;
        if (canVerify) tr.onclick = () => (window as any).verifyProspect(item.id);
        tr.innerHTML = `
            <td class="py-3 px-4 font-data-mono font-bold text-primary">PROS-${item.id}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${item.nama_toko}</td>
            <td class="py-3 px-4 text-slate-600">${item.pic}</td>
            <td class="py-3 px-4 text-slate-600">${item.kontak}</td>
            <td class="py-3 px-4 text-center">
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${badge}">${item.status}</span>
            </td>
            <td class="py-3 px-4 text-center">
                ${canVerify
                    ? `<button onclick="event.stopPropagation(); window.verifyProspect(${item.id})"
                        class="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg text-[11px] font-bold transition-colors">
                        Verifikasi
                       </button>`
                    : `<span class="text-slate-300 text-[11px]">—</span>`}
            </td>`;
        tbody.appendChild(tr);
    });
    
    renderPaginationUI(
        'onboarding-pagination',
        'onboarding-page-info',
        onboardingCurrentPage,
        onboardingPerPage,
        totalItems,
        (newPage) => { onboardingCurrentPage = newPage; renderOnboarding(); }
    );
}

// ─── WARRANTY / KLAIM ────────────────────────────────────────
async function loadWarranty() {
    const tbody = document.getElementById('warranty-table-body');
    const statsEl = document.getElementById('warranty-stats');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-sm text-slate-400">Memuat...</td></tr>`;
    try {
        const res = await apiFetch<any>('aftersales/klaim');
        if (res.success) {
            allWarranty = res.data || [];
            warrantyCurrentPage = 1;
            renderWarrantyStats(allWarranty);
            renderWarranty();
            
            // Badge count for pending
            const pending = allWarranty.filter((k: any) => k.status_klaim === 'SUBMITTED').length;
            const badge = document.getElementById('badge-warranty');
            if (badge) {
                if (pending > 0) { badge.textContent = pending.toString(); badge.classList.remove('hidden'); }
                else badge.classList.add('hidden');
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-sm text-slate-400 italic">Belum ada tiket klaim garansi.</td></tr>`;
            renderWarrantyStats([]);
            renderPaginationUI('warranty-pagination', 'warranty-page-info', 1, 10, 0, () => {});
        }
    } catch {
        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-sm text-rose-500">Gagal memuat data klaim.</td></tr>`;
    }
}

function renderWarranty() {
    const tbody = document.getElementById('warranty-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (allWarranty.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-sm text-slate-400 italic">Belum ada tiket klaim garansi.</td></tr>`;
        renderPaginationUI('warranty-pagination', 'warranty-page-info', 1, 10, 0, () => {});
        return;
    }
    
    const totalItems = allWarranty.length;
    const totalPages = Math.ceil(totalItems / warrantyPerPage);
    if (warrantyCurrentPage < 1) warrantyCurrentPage = 1;
    if (warrantyCurrentPage > totalPages) warrantyCurrentPage = totalPages;
    
    const startIndex = (warrantyCurrentPage - 1) * warrantyPerPage;
    const currentItems = allWarranty.slice(startIndex, startIndex + warrantyPerPage);
    
    currentItems.forEach((k: any) => {
        const statusMap: Record<string, { cls: string; label: string }> = {
            'SUBMITTED':       { cls: 'bg-blue-50 text-blue-700 border-blue-200',    label: 'Submitted' },
            'IN_INSPECTION':   { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Inspeksi' },
            'APPROVED_REPLACE':{ cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ganti Unit' },
            'APPROVED_REWORK': { cls: 'bg-teal-50 text-teal-700 border-teal-200',    label: 'Rework' },
            'REJECTED':        { cls: 'bg-rose-50 text-rose-700 border-rose-200',    label: 'Ditolak' },
        };
        const s = statusMap[k.status_klaim] || { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: k.status_klaim };
        const tgl = k.tanggal_klaim ? new Date(k.tanggal_klaim).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const keluhan = k.deskripsi_keluhan || '—';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors text-xs cursor-pointer';
        tr.onclick = () => (window as any).openInvestigasi(k);
        tr.innerHTML = `
            <td class="py-3 px-4 font-data-mono font-bold text-primary">${k.id_klaim}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${k.nama_retailer || '—'}</td>
            <td class="py-3 px-4 font-data-mono text-slate-700">${k.kode_item_fg || '—'}</td>
            <td class="py-3 px-4 text-slate-500">${k.nomor_so || '—'}</td>
            <td class="py-3 px-4 text-slate-500">${tgl}</td>
            <td class="py-3 px-4 text-slate-600 max-w-[160px] truncate" title="${keluhan}">${keluhan}</td>
            <td class="py-3 px-4 text-center">
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${s.cls}">${s.label}</span>
            </td>
            <td class="py-3 px-4 text-center">
                <button onclick="event.stopPropagation(); window.openInvestigasi(${JSON.stringify(k).replace(/"/g, '&quot;')})"
                    class="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors">
                    <span class="material-symbols-outlined text-[16px]">manage_search</span>
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
    
    renderPaginationUI(
        'warranty-pagination',
        'warranty-page-info',
        warrantyCurrentPage,
        warrantyPerPage,
        totalItems,
        (newPage) => { warrantyCurrentPage = newPage; renderWarranty(); }
    );
}

function renderWarrantyStats(data: any[]) {
    const el = document.getElementById('warranty-stats');
    if (!el) return;
    const total = data.length;
    const submitted = data.filter(k => k.status_klaim === 'SUBMITTED').length;
    const inProgress = data.filter(k => k.status_klaim === 'IN_INSPECTION').length;
    const resolved = data.filter(k => ['APPROVED_REPLACE','APPROVED_REWORK','REJECTED'].includes(k.status_klaim)).length;
    const stats = [
        { label: 'Total Klaim', val: total, cls: 'border-slate-200 text-slate-700', icon: 'confirmation_number' },
        { label: 'Menunggu', val: submitted, cls: 'border-blue-200 text-blue-700', icon: 'pending_actions' },
        { label: 'Diinspeksi', val: inProgress, cls: 'border-amber-200 text-amber-700', icon: 'manage_search' },
        { label: 'Diselesaikan', val: resolved, cls: 'border-emerald-200 text-emerald-700', icon: 'task_alt' },
    ];
    el.innerHTML = stats.map(s => `
        <div class="bg-white border ${s.cls} rounded-xl p-4 flex items-center gap-3">
            <span class="material-symbols-outlined text-[22px] ${s.cls.split(' ')[1]}">${s.icon}</span>
            <div>
                <p class="text-xl font-black ${s.cls.split(' ')[1]}">${s.val}</p>
                <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">${s.label}</p>
            </div>
        </div>`).join('');
}

// ─── INVESTIGASI MODAL ───────────────────────────────────────
(window as any).openInvestigasi = (k: any) => {
    currentKlaimId = k.id_klaim;
    const summary = document.getElementById('investigasi-summary');
    if (summary) {
        const statusLabels: Record<string, string> = {
            SUBMITTED: 'Menunggu Inspeksi', IN_INSPECTION: 'Sedang Diinspeksi',
            APPROVED_REPLACE: 'Disetujui — Ganti Unit', APPROVED_REWORK: 'Disetujui — Rework', REJECTED: 'Ditolak',
        };
        summary.innerHTML = `
            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span class="text-slate-400 font-semibold uppercase text-[10px]">No. Klaim</span><p class="font-data-mono font-bold text-primary mt-0.5">${k.id_klaim}</p></div>
                <div><span class="text-slate-400 font-semibold uppercase text-[10px]">Status</span><p class="font-bold text-slate-800 mt-0.5">${statusLabels[k.status_klaim] || k.status_klaim}</p></div>
                <div><span class="text-slate-400 font-semibold uppercase text-[10px]">Retailer</span><p class="font-semibold text-slate-800 mt-0.5">${k.nama_retailer || '—'}</p></div>
                <div><span class="text-slate-400 font-semibold uppercase text-[10px]">Produk</span><p class="font-data-mono font-bold text-slate-800 mt-0.5">${k.kode_item_fg || '—'}</p></div>
                <div class="col-span-2"><span class="text-slate-400 font-semibold uppercase text-[10px]">Keluhan</span><p class="text-slate-700 mt-0.5 leading-relaxed">${k.deskripsi_keluhan || '—'}</p></div>
                ${k.catatan_investigasi_qc ? `<div class="col-span-2"><span class="text-slate-400 font-semibold uppercase text-[10px]">Catatan QC</span><p class="text-slate-700 mt-0.5">${k.catatan_investigasi_qc}</p></div>` : ''}
            </div>`;
    }

    const isQC = currentUser?.divisi_role === 'Kendali Mutu' || currentUser?.divisi_role === 'Owner';
    const isResolved = ['APPROVED_REPLACE','APPROVED_REWORK','REJECTED'].includes(k.status_klaim);
    const formWrapper = document.getElementById('investigasi-form-wrapper');
    const footer = document.getElementById('investigasi-footer');

    if (formWrapper) formWrapper.style.display = (isQC && !isResolved) ? 'block' : 'none';
    if (footer) {
        if (isQC && !isResolved) {
            footer.innerHTML = `
                <button type="button" id="btn-cancel-investigasi" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/50 rounded-lg">Tutup</button>
                <button type="button" id="btn-submit-investigasi" class="px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                    <span class="material-symbols-outlined text-[16px]">save</span> Simpan Investigasi
                </button>`;
            document.getElementById('btn-cancel-investigasi')?.addEventListener('click', () => closeModal('modal-investigasi'));
            document.getElementById('btn-submit-investigasi')?.addEventListener('click', submitInvestigasi);
        } else {
            footer.innerHTML = `<button type="button" id="btn-close-inv-footer" class="px-5 py-2 text-sm font-bold bg-slate-800 text-white rounded-lg">Tutup</button>`;
            document.getElementById('btn-close-inv-footer')?.addEventListener('click', () => closeModal('modal-investigasi'));
        }
    }

    (document.getElementById('input-investigasi-status') as HTMLSelectElement).value = '';
    (document.getElementById('input-investigasi-catatan') as HTMLTextAreaElement).value = k.catatan_investigasi_qc || '';
    openModal('modal-investigasi');
};

async function submitInvestigasi() {
    const status = (document.getElementById('input-investigasi-status') as HTMLSelectElement).value;
    const catatan = (document.getElementById('input-investigasi-catatan') as HTMLTextAreaElement).value;
    if (!status) { toast('Pilih status resolusi terlebih dahulu.', true); return; }
    if (!currentKlaimId) return;
    try {
        const res = await apiFetch<any>(`aftersales/klaim/${currentKlaimId}/investigate`, {
            method: 'PATCH',
            body: JSON.stringify({ status_klaim: status, catatan_investigasi_qc: catatan })
        });
        if (res.success) {
            toast(res.message);
            closeModal('modal-investigasi');
            await loadWarranty();
        } else toast(res.message, true);
    } catch { toast('Gagal menyimpan investigasi.', true); }
}

// ─── VERIFY PROSPECT ─────────────────────────────────────────
(window as any).verifyProspect = (id: number) => {
    const prospek = allOnboarding.find((p: any) => p.id === id);
    if (!prospek) return;

    const modal = document.getElementById('modal-verifikasi-prospek');
    const content = document.getElementById('modal-verifikasi-prospek-content');
    
    const elToko = document.getElementById('detail-nama-toko');
    if (elToko) elToko.textContent = prospek.nama_toko;
    
    const elPic = document.getElementById('detail-pic');
    if (elPic) elPic.textContent = prospek.pic;
    
    const elKontak = document.getElementById('detail-kontak');
    if (elKontak) elKontak.textContent = prospek.kontak;
    
    const elAlamat = document.getElementById('detail-alamat');
    if (elAlamat) elAlamat.textContent = prospek.alamat || '—';

    const elDokumen = document.getElementById('detail-dokumen-nib') as HTMLAnchorElement;
    if (elDokumen) {
        if (prospek.dokumen_nib) {
            const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5050/api';
            const uploadBase = apiBase.replace('/api', '/uploads/crm/onboarding/');
            elDokumen.href = uploadBase + prospek.dokumen_nib;
            elDokumen.classList.remove('hidden');
        } else {
            elDokumen.removeAttribute('href');
            elDokumen.classList.add('hidden');
        }
    }

    const oldBtn = document.getElementById('btn-submit-verifikasi');
    if (oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode?.replaceChild(newBtn, oldBtn);
        newBtn.addEventListener('click', async () => {
            const spinner = document.getElementById('spinner-verifikasi');
            if (spinner) spinner.classList.remove('hidden');
            (newBtn as HTMLButtonElement).disabled = true;

            try {
                const res = await apiFetch<any>(`crm/onboarding/${id}/verify`, { method: 'POST' });
                if (res.success) {
                    toast(`✅ Terverifikasi! Username: ${res.data?.username}`);
                    closeModal('modal-verifikasi-prospek');
                    await loadOnboarding();
                } else {
                    toast(res.message, true);
                }
            } catch {
                toast('Gagal memverifikasi prospek.', true);
            } finally {
                if (spinner) spinner.classList.add('hidden');
                (newBtn as HTMLButtonElement).disabled = false;
            }
        });
    }

    if (modal && content) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
    }
};

// ─── MODAL SETUP ─────────────────────────────────────────────
function setupModals() {
    // Close buttons
    document.getElementById('btn-close-onboarding')?.addEventListener('click', () => closeModal('modal-onboarding'));
    document.getElementById('btn-cancel-onboarding')?.addEventListener('click', () => closeModal('modal-onboarding'));
    document.getElementById('btn-close-klaim')?.addEventListener('click', () => closeModal('modal-klaim'));
    document.getElementById('btn-cancel-klaim')?.addEventListener('click', () => closeModal('modal-klaim'));
    document.getElementById('btn-close-investigasi')?.addEventListener('click', () => closeModal('modal-investigasi'));
    document.getElementById('btn-close-verifikasi')?.addEventListener('click', () => closeModal('modal-verifikasi-prospek'));
    document.getElementById('btn-cancel-verifikasi')?.addEventListener('click', () => closeModal('modal-verifikasi-prospek'));

    // Open prospek modal
    document.getElementById('btn-add-prospek')?.addEventListener('click', () => {
        (document.getElementById('form-onboarding') as HTMLFormElement).reset();
        openModal('modal-onboarding');
    });

    // Open klaim modal — populate SO dropdown
    document.getElementById('btn-add-klaim')?.addEventListener('click', () => {
        (document.getElementById('form-klaim') as HTMLFormElement)?.reset();
        (document.getElementById('klaim-so-detail') as HTMLElement).classList.add('hidden');
        const sel = document.getElementById('input-klaim-so') as HTMLSelectElement;
        sel.innerHTML = '<option value="">-- Pilih SO --</option>';
        masterSO.forEach(so => {
            const opt = document.createElement('option');
            opt.value = so.id.toString();
            // Support both schema: nomor_so (new) and no_so (penjualan_so_header)
            const noSo = so.nomor_so || so.no_so || `SO-${so.id}`;
            const customer = so.nama_customer || `Customer #${so.id_customer || so.id}`;
            opt.textContent = `${noSo} — ${customer}`;
            opt.dataset.customer = customer;
            opt.dataset.tanggal = so.tanggal_so || so.created_at || '';
            opt.dataset.items = JSON.stringify(so.items || []);
            sel.appendChild(opt);
        });
        openModal('modal-klaim');
    });

    // SO change → populate produk + detail
    document.getElementById('input-klaim-so')?.addEventListener('change', (e) => {
        const sel = e.target as HTMLSelectElement;
        const opt = sel.options[sel.selectedIndex];
        const detailEl = document.getElementById('klaim-so-detail');
        const fgSel = document.getElementById('input-klaim-fg') as HTMLSelectElement;
        fgSel.innerHTML = '<option value="">-- Pilih Produk --</option>';
        if (!sel.value) { detailEl?.classList.add('hidden'); return; }
        detailEl?.classList.remove('hidden');
        const customer = opt.dataset.customer || '—';
        const tgl = opt.dataset.tanggal ? new Date(opt.dataset.tanggal).toLocaleDateString('id-ID') : '—';
        (document.getElementById('klaim-detail-retailer') as HTMLElement).textContent = customer;
        (document.getElementById('klaim-detail-date') as HTMLElement).textContent = `Tanggal: ${tgl}`;
        try {
            const items = JSON.parse(opt.dataset.items || '[]');
            items.forEach((item: any) => {
                const o = document.createElement('option');
                const kode = item.kode_barang || item.kode_item || item.kode_sepeda || '';
                o.value = kode;
                o.textContent = `${kode} (${item.qty || item.kuantitas || '?'} unit)`;
                fgSel.appendChild(o);
            });
        } catch { /* no items */ }
    });

    // Submit klaim
    document.getElementById('btn-submit-klaim')?.addEventListener('click', async () => {
        const soId = (document.getElementById('input-klaim-so') as HTMLSelectElement).value;
        const soSel = document.getElementById('input-klaim-so') as HTMLSelectElement;
        const opt = soSel.options[soSel.selectedIndex];
        const namaRetailer = opt?.dataset.customer || '';
        const kodeFg = (document.getElementById('input-klaim-fg') as HTMLSelectElement).value;
        const keluhan = (document.getElementById('input-klaim-keluhan') as HTMLTextAreaElement).value.trim();
        const fileInput = document.getElementById('input-klaim-foto') as HTMLInputElement;

        if (!soId || !namaRetailer || !kodeFg || !keluhan || !fileInput.files?.length) {
            toast('Lengkapi semua field termasuk foto bukti.', true); return;
        }

        const btnSubmit = document.getElementById('btn-submit-klaim') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-klaim');
        btnSubmit.disabled = true;
        spinner?.classList.remove('hidden');

        try {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;
                try {
                    const res = await apiFetch<any>('aftersales/klaim', {
                        method: 'POST',
                        body: JSON.stringify({ id_sales_order: soId, nama_retailer: namaRetailer, kode_item_fg: kodeFg, deskripsi_keluhan: keluhan, foto_bukti_kerusakan: base64 })
                    });
                    if (res.success) {
                        toast(res.message);
                        closeModal('modal-klaim');
                        await loadWarranty();
                    } else toast(res.message, true);
                } catch { toast('Gagal mengirim klaim.', true); }
                finally { btnSubmit.disabled = false; spinner?.classList.add('hidden'); }
            };
        } catch { toast('Gagal membaca file foto.', true); btnSubmit.disabled = false; spinner?.classList.add('hidden'); }
    });

    // Submit onboarding
    document.getElementById('form-onboarding')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        try {
            const res = await apiFetch<any>('crm/onboarding', { method: 'POST', body: formData });
            if (res.success) {
                toast(res.message || 'Prospek berhasil didaftarkan.');
                closeModal('modal-onboarding');
                form.reset();
                await loadOnboarding();
            } else toast(res.message, true);
        } catch { toast('Gagal mendaftarkan prospek.', true); }
    });

    // Tab click → load data
    document.getElementById('tab-warranty')?.addEventListener('click', () => loadWarranty());
    document.getElementById('tab-onboarding')?.addEventListener('click', () => loadOnboarding());
}
