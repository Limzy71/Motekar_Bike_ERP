/**
 * mutu.ts — Logic untuk halaman Kendali Mutu (QC Inspeksi ISO 4210).
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface WorkOrder {
    id: number;
    nomor_wo: string;
    kode_barang: string;
    jumlah_produksi: number;
    status: string;
    produk: string;
    created_at: string;
    catatan_rework?: string;
    qc_history?: any;
}

interface WOResponse {
    success: boolean;
    data: WorkOrder[];
    message?: string;
}

interface Klaim { 
    no_klaim: string; 
    ar_invoice_id: number; 
    invoice_date: string;
    keluhan: string; 
    foto_kerusakan: string; 
    status: string; 
    catatan_investigasi_qc?: string;
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
    const queueSelesai = masterWO.filter(wo => wo.status === 'TUNING_QC');
    const countPassed = masterWO.filter(wo => wo.status === 'COMPLETED').length;
    
    // Perlu Rework = WO yang memiliki catatan_rework dan statusnya masih belum COMPLETED
    const countFailed = masterWO.filter(wo => wo.catatan_rework && wo.status !== 'COMPLETED').length;

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
        tr.className = 'hover:bg-slate-100 cursor-pointer transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.onclick = () => openQCModal(wo);
        tr.innerHTML = `
            <td class="px-4 py-3">
                <p class="font-semibold text-slate-900 font-data-mono">${wo.nomor_wo}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-700">${wo.produk || wo.kode_barang}</p>
            </td>
            <td class="px-4 py-3">
                <p class="font-bold text-slate-900">${wo.jumlah_produksi} Unit</p>
            </td>
            <td class="px-4 py-3">
                <p>${dateStr}</p>
            </td>
            <td class="px-4 py-3">
                <span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border ${wo.catatan_rework ? 'bg-rose-50 text-rose-700 border-rose-200/80 shadow-sm' : 'bg-amber-50 text-amber-700 border-amber-200/80'}">${wo.catatan_rework ? '<span class="material-symbols-outlined text-[14px]">history</span> Kembali dari Rework' : 'Menunggu QC'}</span>
            </td>
            <td class="px-4 py-3 text-center">
                <button class="btn-inspeksi text-slate-400 hover:text-primary hover:bg-primary-container/30 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1.5 w-full border border-transparent hover:border-primary/20" data-id="${wo.id}">
                    <span class="material-symbols-outlined text-[16px]">search</span> Inspeksi
                </button>
            </td>
        `;

        // The button will also trigger the tr.onclick due to bubbling, which is perfectly fine here.
        
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
        const response = await apiFetch<{success: boolean, data: Klaim[]}>('crm/warranty');
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

    const pendingKlaim = masterKlaim.filter(k => k.status === 'PENDING' || k.status === 'IN_INSPECTION');

    if (pendingKlaim.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada antrean investigasi klaim saat ini.</td></tr>`;
        return;
    }

    pendingKlaim.forEach(k => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
        tr.innerHTML = `
            <td class="px-4 py-3 font-bold text-primary font-data-mono">${k.no_klaim}</td>
            <td class="px-4 py-3 font-bold text-slate-800">INV-${k.ar_invoice_id}</td>
            <td class="px-4 py-3 truncate max-w-[200px]" title="${k.keluhan}">${k.keluhan}</td>
            <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200">${k.status}</span></td>
            <td class="px-4 py-3 text-center">
                <button class="btn-investigasi text-slate-400 hover:text-primary hover:bg-primary-container/30 px-3 py-1.5 rounded-md transition-all font-bold tracking-wide flex items-center justify-center gap-1.5 w-full border border-transparent hover:border-primary/20" data-id="${k.no_klaim}">
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
    
    (document.getElementById('modal-klaim-id') as HTMLSpanElement).textContent = k.no_klaim;
    (document.getElementById('modal-klaim-foto') as HTMLImageElement).src = k.foto_kerusakan ? `/uploads/${k.foto_kerusakan}` : '';
    (document.getElementById('modal-klaim-keluhan') as HTMLParagraphElement).textContent = k.keluhan;
    
    const form = document.getElementById('form-investigasi') as HTMLFormElement;
    form?.reset();
    (document.getElementById('input-investigasi-id') as HTMLInputElement).value = k.no_klaim;

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
            const response = await apiFetch<ActionResponse>(`crm/warranty/${id_klaim}/investigate`, {
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
        // Sekaligus simpan riwayat pilihan masing-masing checklist
        let finalResult = 'Pass';
        const qcHistory: Record<string, string> = {};
        for (let i = 1; i <= 5; i++) {
            const val = formData.get(`chk_${i}`) as string;
            qcHistory[`chk_${i}`] = val;
            if (val === 'Fail') {
                finalResult = 'Fail';
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
            defectNotes: defectNotes,
            qcHistory: qcHistory
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
    if (summaryLabel) summaryLabel.innerHTML = `Mengevaluasi <strong>${wo.jumlah_produksi} Unit</strong> sepeda model <strong>${wo.produk || wo.kode_barang}</strong>.`;
    if (inputWoId) inputWoId.value = wo.id.toString();

    // Inject Rework History if exists
    const historyContainer = document.getElementById('qc-rework-history');
    const historyList = document.getElementById('qc-rework-list');
    
    if (historyContainer && historyList) {
        if (wo.catatan_rework) {
            const notes = wo.catatan_rework.split('\n').filter((line: string) => line.trim().length > 0);
            historyList.innerHTML = notes.map((note: string) => `
                <li class="flex items-start gap-2 text-[11px] text-slate-700 leading-relaxed">
                    <span class="material-symbols-outlined text-[14px] text-rose-400 mt-[1px]">error</span>
                    <span>${note}</span>
                </li>
            `).join('');
            historyContainer.classList.remove('hidden');
        } else {
            historyContainer.classList.add('hidden');
            historyList.innerHTML = '';
        }
    }

    // Reset UI State
    const form = document.getElementById('form-qc') as HTMLFormElement;
    form?.reset();
    const reworkContainer = document.getElementById('rework-container');
    const inputDefect = document.getElementById('input-defect') as HTMLTextAreaElement;
    if (reworkContainer) reworkContainer.classList.add('hidden');
    if (inputDefect) inputDefect.required = false;

    // Load Previous QC Pass/Fail History if exists
    if (wo.qc_history) {
        try {
            const qcHistoryObj = typeof wo.qc_history === 'string' ? JSON.parse(wo.qc_history) : wo.qc_history;
            let hasFail = false;
            
            for (let i = 1; i <= 5; i++) {
                const val = qcHistoryObj[`chk_${i}`];
                if (val) {
                    const radio = form.querySelector(`input[name="chk_${i}"][value="${val}"]`) as HTMLInputElement;
                    if (radio) radio.checked = true;
                    if (val === 'Fail') hasFail = true;
                }
            }
            
            if (hasFail && reworkContainer) {
                reworkContainer.classList.remove('hidden');
                if (inputDefect) {
                    // Hanya set required, jangan timpa isi lama agar inspector bisa melihat apa yang ditulis sebelumnya atau biarkan kosong jika dia ingin mengetik ulang, 
                    // tapi sebentar, lebih baik jangan di-isi (karena riwayat ada di container atas).
                    inputDefect.required = true;
                }
            }
        } catch (e) {
            console.error('Failed to parse QC History', e);
        }
    }

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

    const switchTab = (tabName: 'inspeksi' | 'investigasi') => {
        if (tabName === 'inspeksi') {
            tabInspeksi!.className = activeClass;
            tabInvestigasi!.className = inactiveClass;
            viewInspeksi?.classList.remove('hidden');
            viewInvestigasi?.classList.add('hidden');
            localStorage.setItem('mutuLastTab', 'inspeksi');
        } else {
            tabInvestigasi!.className = activeClass;
            tabInspeksi!.className = inactiveClass;
            viewInvestigasi?.classList.remove('hidden');
            viewInspeksi?.classList.add('hidden');
            localStorage.setItem('mutuLastTab', 'investigasi');
            loadInvestigasiKlaim();
        }
    };

    tabInspeksi?.addEventListener('click', () => switchTab('inspeksi'));
    tabInvestigasi?.addEventListener('click', () => switchTab('investigasi'));

    const lastTab = localStorage.getItem('mutuLastTab');
    if (lastTab === 'investigasi') {
        switchTab('investigasi');
    } else {
        switchTab('inspeksi');
    }

    // Remove anti-flicker style once tabs are properly initialized
    const antiFlicker = document.getElementById('anti-flicker');
    if (antiFlicker) antiFlicker.remove();
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

    // Polling for Real-Time Experience (Every 30 seconds)
    setInterval(() => {
        const tab = localStorage.getItem('mutuLastTab') || 'inspeksi';
        if (tab === 'inspeksi') loadQCQueue();
        else if (tab === 'investigasi') loadInvestigasiKlaim();
    }, 30000);
});
