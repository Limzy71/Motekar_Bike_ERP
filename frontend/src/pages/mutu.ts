/**
 * mutu.ts — Logic untuk halaman Kendali Mutu (QC Inspeksi ISO 4210).
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface WorkOrder {
    id: number;
    nomor_wo: string;
    kode_sepeda: string;
    jumlah_produksi: number;
    status: string;
    nama_sepeda: string;
    created_at: string;
    catatan_rework?: string;
}

interface WOResponse {
    success: boolean;
    data: WorkOrder[];
    message?: string;
}

interface Klaim { 
    id_klaim: string; 
    nama_retailer: string; 
    kode_item_fg: string; 
    tanggal_klaim: string; 
    deskripsi_keluhan: string; 
    foto_bukti_kerusakan: string; 
    status_klaim: string; 
    catatan_investigasi_qc: string; 
}

interface ActionResponse {
    success: boolean;
    message: string;
}

let masterWO: WorkOrder[] = [];
let masterKlaim: Klaim[] = [];

let currentPage = 1;
const itemsPerPage = 10;

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadQCQueue(): Promise<void> {
    const tbody = document.getElementById('tbody-mutu');
    if (!tbody) return;

    try {
        const response = await apiFetch<WOResponse>('operasi/wo');
        
        if (response.success) {
            masterWO = response.data;
            renderData();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
            showToast(response.message || 'Gagal memuat data', true);
        }
    } catch (err) {
        console.error('loadQC error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
        showToast('Terjadi kesalahan jaringan.', true);
    }
}

function renderData(): void {
    const tbody = document.getElementById('tbody-mutu');
    if (!tbody) return;

    // Filter sisi klien sesuai instruksi
    const queueSelesai = masterWO.filter(wo => wo.status === 'Selesai');
    const countPassed = masterWO.filter(wo => wo.status === 'Closed').length;
    
    // Perlu Rework = WO yang memiliki catatan_rework dan statusnya masih belum Closed
    const countFailed = masterWO.filter(wo => wo.catatan_rework && wo.status !== 'Closed').length;

    // Update KPI
    const kpiAntrean = document.getElementById('kpi-antrean');
    const kpiPassed = document.getElementById('kpi-passed');
    const kpiFailed = document.getElementById('kpi-failed');

    if (kpiAntrean) kpiAntrean.textContent = queueSelesai.length.toString();
    if (kpiPassed) kpiPassed.textContent = countPassed.toString();
    if (kpiFailed) kpiFailed.textContent = countFailed.toString();

    tbody.innerHTML = '';

    if (queueSelesai.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada antrean Work Order yang menunggu inspeksi QC.</td></tr>`;
        updatePaginationUI();
        return;
    }

    const totalItems = queueSelesai.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = queueSelesai.slice(startIndex, endIndex);

    currentItems.forEach(wo => {
        // Tanggal Selesai Rakit (menggunakan updated_at atau dummy jika tidak ada)
        const d = new Date(wo.created_at);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.innerHTML = `
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-900 font-data-mono">${wo.nomor_wo}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-700">${wo.nama_sepeda || wo.kode_sepeda}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-900">${wo.jumlah_produksi} Unit</p>
            </td>
            <td class="px-4 py-3">
                <p>${dateStr}</p>
            </td>
            <td class="px-4 py-3">
                <span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-amber-50 text-amber-700 border-amber-200/80">Menunggu QC</span>
            </td>
            <td class="px-4 py-3 text-center">
                <button class="btn-inspeksi text-slate-400 hover:text-primary hover:bg-primary-container/30 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1.5 w-full border border-transparent hover:border-primary/20" data-id="${wo.id}">
                    <span class="material-symbols-outlined text-[16px]">search</span> Inspeksi
                </button>
            </td>
        `;

        const btn = tr.querySelector('.btn-inspeksi');
        btn?.addEventListener('click', () => openQCModal(wo));

        tbody.appendChild(tr);
    });

    updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updatePaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('mutu-pagination-info');
    const btnPrev = document.getElementById('mutu-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('mutu-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('mutu-pagination-pages');

    if (infoText) {
        if (total === 0) {
            infoText.textContent = `Menampilkan 0-0 dari 0 data`;
        } else {
            infoText.textContent = `Menampilkan ${start}-${end} dari ${total} data`;
        }
    }

    if (btnPrev) {
        btnPrev.disabled = currentPage <= 1;
        btnPrev.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderData();
            }
        };
    }

    if (btnNext) {
        btnNext.disabled = currentPage >= totalPages;
        btnNext.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderData();
            }
        };
    }

    if (pagesContainer) {
        pagesContainer.innerHTML = '';
        if (totalPages > 1) {
            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.className = `w-7 h-7 rounded-lg text-xs font-bold transition-colors ${i === currentPage ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;
                btn.textContent = i.toString();
                btn.onclick = () => {
                    currentPage = i;
                    renderData();
                };
                pagesContainer.appendChild(btn);
            }
        }
    }
}

// ============================================================
// INVESTIGASI KLAIM GARANSI
// ============================================================

async function loadInvestigasiKlaim(): Promise<void> {
    const tbody = document.getElementById('tbody-investigasi');
    if (!tbody) return;

    try {
        const response = await apiFetch<{success: boolean, data: Klaim[]}>('aftersales/klaim');
        if (response.success) {
            masterKlaim = response.data;
            renderInvestigasiKlaim();
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data klaim.</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Kesalahan jaringan.</td></tr>`;
    }
}

function renderInvestigasiKlaim(): void {
    const tbody = document.getElementById('tbody-investigasi');
    if (!tbody) return;
    tbody.innerHTML = '';

    const pendingKlaim = masterKlaim.filter(k => k.status_klaim === 'SUBMITTED' || k.status_klaim === 'IN_INSPECTION');

    if (pendingKlaim.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada antrean investigasi klaim saat ini.</td></tr>`;
        return;
    }

    pendingKlaim.forEach(k => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.innerHTML = `
            <td class="px-4 py-3 font-bold text-primary font-data-mono">${k.id_klaim}</td>
            <td class="px-4 py-3 font-bold text-slate-800">${k.kode_item_fg}</td>
            <td class="px-4 py-3 truncate max-w-[200px]" title="${k.deskripsi_keluhan}">${k.deskripsi_keluhan}</td>
            <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200">${k.status_klaim}</span></td>
            <td class="px-4 py-3 text-center">
                <button class="btn-investigasi text-slate-400 hover:text-primary hover:bg-primary-container/30 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1.5 w-full border border-transparent hover:border-primary/20" data-id="${k.id_klaim}">
                    <span class="material-symbols-outlined text-[16px]">plumbing</span> Investigasi
                </button>
            </td>
        `;

        const btn = tr.querySelector('.btn-investigasi');
        btn?.addEventListener('click', () => openInvestigasiModal(k));

        tbody.appendChild(tr);
    });
}

function openInvestigasiModal(k: Klaim): void {
    const modal = document.getElementById('modal-investigasi');
    const content = document.getElementById('modal-investigasi-content');
    
    (document.getElementById('modal-klaim-id') as HTMLSpanElement).textContent = k.id_klaim;
    (document.getElementById('modal-klaim-foto') as HTMLImageElement).src = k.foto_bukti_kerusakan;
    (document.getElementById('modal-klaim-keluhan') as HTMLParagraphElement).textContent = k.deskripsi_keluhan;
    
    const form = document.getElementById('form-investigasi') as HTMLFormElement;
    form?.reset();
    (document.getElementById('input-investigasi-id') as HTMLInputElement).value = k.id_klaim;

    if (modal && content) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    }
}

function setupInvestigasiLogic(): void {
    const modal = document.getElementById('modal-investigasi');
    const content = document.getElementById('modal-investigasi-content');
    const btnClose = document.getElementById('btn-close-investigasi');
    const btnCancel = document.getElementById('btn-cancel-investigasi');
    const form = document.getElementById('form-investigasi') as HTMLFormElement;

    const closeModal = () => {
        if (modal && content) {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                form?.reset();
            }, 300);
        }
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id_klaim = (document.getElementById('input-investigasi-id') as HTMLInputElement).value;
        const catatan = (document.getElementById('input-investigasi-catatan') as HTMLTextAreaElement).value;
        const radioStatus = form.querySelector('input[name="status_klaim"]:checked') as HTMLInputElement;

        if (!radioStatus) {
            showToast('Pilih keputusan resolusi!', true);
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-investigasi') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-investigasi');
        
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.classList.add('opacity-80', 'cursor-wait'); }
        if (spinner) { spinner.classList.remove('hidden'); spinner.classList.add('animate-spin'); }

        try {
            const response = await apiFetch<ActionResponse>(`aftersales/klaim/${id_klaim}/investigate`, {
                method: 'PATCH',
                body: JSON.stringify({ catatan_investigasi_qc: catatan, status_klaim: radioStatus.value })
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadInvestigasiKlaim();
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Gagal memproses investigasi.', true);
        } finally {
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
            if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
        }
    });
}

// ============================================================
// MODAL & FORM LOGIC
// ============================================================

function setupModalLogic(): void {
    const modal = document.getElementById('modal-qc');
    const modalContent = document.getElementById('modal-qc-content');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('form-qc') as HTMLFormElement;
    
    const radios = document.querySelectorAll('input[type="radio"]');
    const reworkContainer = document.getElementById('rework-container');
    const inputDefect = document.getElementById('input-defect') as HTMLTextAreaElement;

    const closeModal = () => {
        if (modal && modalContent) {
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                form?.reset();
                if (reworkContainer) reworkContainer.classList.add('hidden');
                if (inputDefect) inputDefect.required = false;
            }, 300);
        }
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Validasi Checklist Dinamis (Memunculkan form Rework jika ada Fail)
    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const formData = new FormData(form);
            let hasFail = false;
            for (let i = 1; i <= 5; i++) {
                if (formData.get(`chk_${i}`) === 'Fail') {
                    hasFail = true;
                    break;
                }
            }

            if (hasFail) {
                if (reworkContainer) reworkContainer.classList.remove('hidden');
                if (inputDefect) inputDefect.required = true;
            } else {
                if (reworkContainer) reworkContainer.classList.add('hidden');
                if (inputDefect) inputDefect.required = false;
            }
        });
    });

    // Form Submit (POST /api/mutu/inspeksi)
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = document.getElementById('btn-submit-qc') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-qc');
        const textSubmit = document.getElementById('text-submit-qc');
        
        const formData = new FormData(form);
        const woId = formData.get('wo_id');
        const defectNotes = formData.get('defectNotes')?.toString() || '';

        // Tentukan hasil (Jika ada SATU SAJA yang Fail, maka result = Fail)
        let finalResult = 'Pass';
        for (let i = 1; i <= 5; i++) {
            if (formData.get(`chk_${i}`) === 'Fail') {
                finalResult = 'Fail';
                break;
            }
        }

        // Double cek client-side validation
        if (finalResult === 'Fail' && defectNotes.trim() === '') {
            showToast('Catatan defect wajib diisi karena ada parameter yang Gagal QC!', true);
            return;
        }

        const payload = {
            id: woId,
            result: finalResult,
            defectNotes: defectNotes
        };

        // Loading State
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.classList.add('opacity-80', 'cursor-wait');
        }
        if (spinner) spinner.classList.remove('hidden');
        if (textSubmit) textSubmit.textContent = 'Memproses...';

        try {
            const response = await apiFetch<ActionResponse>('mutu/inspeksi', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadQCQueue(); // Re-render tabel
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Terjadi kesalahan saat memproses hasil inspeksi.', true);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('opacity-80', 'cursor-wait');
            }
            if (spinner) spinner.classList.add('hidden');
            if (textSubmit) textSubmit.textContent = 'Submit Hasil QC';
        }
    });

    // Expose close to window for manual calls if needed
    (window as any).closeQCModal = closeModal;
}

function openQCModal(wo: WorkOrder): void {
    const modal = document.getElementById('modal-qc');
    const modalContent = document.getElementById('modal-qc-content');
    
    // Set Data
    const woNumLabel = document.getElementById('modal-wo-number');
    const summaryLabel = document.getElementById('modal-wo-summary');
    const inputWoId = document.getElementById('input-wo-id') as HTMLInputElement;

    if (woNumLabel) woNumLabel.textContent = wo.nomor_wo;
    if (summaryLabel) summaryLabel.innerHTML = `Mengevaluasi <strong>${wo.jumlah_produksi} Unit</strong> sepeda model <strong>${wo.nama_sepeda || wo.kode_sepeda}</strong>.`;
    if (inputWoId) inputWoId.value = wo.id.toString();

    // Reset UI State
    const form = document.getElementById('form-qc') as HTMLFormElement;
    form?.reset();
    const reworkContainer = document.getElementById('rework-container');
    const inputDefect = document.getElementById('input-defect') as HTMLTextAreaElement;
    if (reworkContainer) reworkContainer.classList.add('hidden');
    if (inputDefect) inputDefect.required = false;

    // Show Modal
    if (modal && modalContent) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
}

// ============================================================
// TABS & INIT
// ============================================================

function setupTabs(): void {
    const tabInspeksi = document.getElementById('tab-inspeksi');
    const tabInvestigasi = document.getElementById('tab-investigasi');
    const viewInspeksi = document.getElementById('view-inspeksi');
    const viewInvestigasi = document.getElementById('view-investigasi');
    
    const activeClass = 'pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors';
    const inactiveClass = 'pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors';

    tabInspeksi?.addEventListener('click', () => {
        tabInspeksi.className = activeClass;
        tabInvestigasi!.className = inactiveClass;
        viewInspeksi?.classList.remove('hidden');
        viewInvestigasi?.classList.add('hidden');
    });

    tabInvestigasi?.addEventListener('click', () => {
        tabInvestigasi.className = activeClass;
        tabInspeksi!.className = inactiveClass;
        viewInvestigasi?.classList.remove('hidden');
        viewInspeksi?.classList.add('hidden');
        loadInvestigasiKlaim();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-mutu');
    if (!user) return;

    setupTabs();
    setupModalLogic();
    setupInvestigasiLogic();
    loadQCQueue();

    // Setup Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh?.addEventListener('click', () => {
        loadQCQueue();
    });

    const btnRefreshKlaim = document.getElementById('btn-refresh-klaim');
    btnRefreshKlaim?.addEventListener('click', () => {
        loadInvestigasiKlaim();
    });
});
