/**
 * pemasaran.ts — CRM & Campaign Management (B2B Pipeline Kanban).
 */
import { apiFetch } from '../api.js';
import { initRBAC, showToast, showConfirm } from '../components/rbac.js';

interface Lead {
  id_lead: number;
  id_campaign: number | null;
  nama_toko: string;
  kontak_person: string;
  no_telepon: string;
  estimasi_nilai_deal: number;
  status_pipeline: "New Lead" | "Follow Up" | "Negosiasi" | "Won_Deal" | "Lost";
  catatan: string | null;
  nama_campaign: string | null;
  created_at: string;
  updated_at: string;
}
interface Campaign { id_campaign: number; nama_campaign: string; jenis: string; budget_alokasi: number; tanggal_mulai: string; tanggal_selesai: string; lokasi: string; status: string; created_at: string; }
interface Aktivitas { id_aktivitas: number; tanggal: string; jenis_interaksi: string; catatan_hasil: string; }

interface SOHeader { id: number; nomor_so: string; nama_customer: string; status_so: string; items: any[]; }
interface ActionRes { success: boolean; message: string; }

let masterLeads: Lead[] = [];
let masterCampaigns: Campaign[] = [];

let masterSO: SOHeader[] = [];

let campaignCurrentPage = 1;
const itemsPerPage = 10;

function formatRp(v: number | string): string {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadKPI(): Promise<void> {
    try {
        const r = await apiFetch<{ success: boolean; data: { pipeline_value: number; win_rate: number; roi: number } }>('pemasaran/kpi');
        if (r.success) {
            const el1 = document.getElementById('kpi-pipeline');
            const el2 = document.getElementById('kpi-winrate');
            const el3 = document.getElementById('kpi-roi');
            if (el1) el1.textContent = formatRp(r.data.pipeline_value);
            if (el2) el2.textContent = `${r.data.win_rate}%`;
            if (el3) el3.textContent = `${r.data.roi}%`;
        }
    } catch { showToast('Gagal memuat KPI.', true); }
}

async function loadLeads(): Promise<void> {
    try {
        const r = await apiFetch<{ success: boolean; data: Lead[] }>('pemasaran/leads');
        if (r.success) { masterLeads = r.data; renderKanban(); }
    } catch { showToast('Gagal memuat leads.', true); }
}

async function loadCampaigns(): Promise<void> {
    try {
        const r = await apiFetch<{ success: boolean; data: Campaign[] }>('pemasaran/campaigns');
        if (r.success) { masterCampaigns = r.data; renderCampaigns(); populateCampaignDropdown(); }
    } catch { showToast('Gagal memuat kampanye.', true); }
}



async function loadSO(): Promise<void> {
    try {
        const r = await apiFetch<{ success: boolean; data: SOHeader[] }>('penjualan/so');
        if (r.success) { 
            masterSO = r.data.filter(so => ['PAID', 'SHIPPED', 'DELIVERED'].includes(so.status_so)); 
        }
    } catch {}
}

// ============================================================
// KANBAN RENDERING
// ============================================================
function renderKanban(): void {
    const statuses = ['New Lead', 'Follow Up', 'Negosiasi', 'Won_Deal', 'Lost'];
    statuses.forEach(status => {
        const container = document.querySelector(`.lead-container[data-status="${status}"]`) as HTMLElement;
        const badge = container?.closest('.kanban-col')?.querySelector('.count-badge');
        if (!container) return;
        const leads = masterLeads.filter(l => l.status_pipeline === status);
        if (badge) badge.textContent = leads.length.toString();
        container.innerHTML = '';
        if (leads.length === 0) {
            container.innerHTML = '<p class="text-[10px] text-slate-400 italic text-center py-4">Kosong</p>';
            return;
        }
        leads.forEach(lead => {
            const card = document.createElement('div');
            card.className = 'lead-card bg-white border border-slate-200 rounded-lg p-3 shadow-xs hover:shadow-sm';
            card.dataset.id = lead.id_lead.toString();
            card.innerHTML = `
                <p class="text-sm font-bold text-slate-800 leading-tight">${lead.nama_toko ?? '-'}</p>
                <p class="text-[10px] text-slate-500 mt-1">${lead.kontak_person ?? '-'} · ${lead.no_telepon ?? '-'}</p>
                ${lead.nama_campaign ? `<p class="text-[10px] text-primary font-semibold mt-1.5">📌 ${lead.nama_campaign}</p>` : ''}
                <p class="text-xs font-black text-emerald-700 mt-2 font-data-mono">${formatRp(lead.estimasi_nilai_deal ?? 0)}</p>
            `;

            if (lead.status_pipeline === 'Won_Deal' || lead.status_pipeline === 'Lost') {
                card.draggable = false;
                card.classList.add('cursor-not-allowed', 'opacity-80', 'bg-slate-50');
            } else {
                card.draggable = true;
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer?.setData('text/plain', lead.id_lead.toString());
                    card.classList.add('opacity-50');
                });
                card.addEventListener('dragend', () => card.classList.remove('opacity-50'));
            }
            card.addEventListener('click', () => openLeadDetail(lead));
            container.appendChild(card);
        });
    });
}

function setupDragDrop(): void {
    const cols = document.querySelectorAll('.kanban-col');
    cols.forEach(col => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');
            const ev = e as DragEvent;
            const leadId = ev.dataTransfer?.getData('text/plain');
            const newStatus = (col as HTMLElement).dataset.status;
            if (!leadId || !newStatus) return;
            const executeMove = async () => {
                try {
                    const r = await apiFetch<ActionRes>(`pemasaran/leads/${leadId}/status`, {
                        method: 'PATCH', body: JSON.stringify({ status_pipeline: newStatus })
                    });
                    if (r.success) { showToast(r.message); await Promise.all([loadLeads(), loadKPI()]); }
                    else { showToast(r.message, true); }
                } catch { showToast('Gagal memperbarui status.', true); }
            };

            if (newStatus === 'Won_Deal' || newStatus === 'Lost') {
                const statusText = newStatus === 'Won_Deal' ? 'Won Deal' : 'Lost';
                showConfirm(`Konfirmasi ${statusText}`, `Tandai sebagai ${statusText}? Data master lead akan dikunci permanen.`, () => {
                    executeMove();
                });
            } else {
                executeMove();
            }
        });
    });
}

// ============================================================
// CAMPAIGNS RENDERING
// ============================================================
function renderCampaigns(): void {
    const tbody = document.getElementById('tbody-campaigns');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (masterCampaigns.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-xs text-slate-500">Belum ada data kampanye.</td></tr>'; 
        updateCampaignPaginationUI();
        return; 
    }

    const totalItems = masterCampaigns.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (campaignCurrentPage < 1) campaignCurrentPage = 1;
    if (campaignCurrentPage > totalPages) campaignCurrentPage = totalPages;

    const startIndex = (campaignCurrentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = masterCampaigns.slice(startIndex, endIndex);

    currentItems.forEach(c => {
        const jenisBadge: Record<string, string> = { 'Pameran': 'bg-violet-50 text-violet-700', 'Digital Ads': 'bg-blue-50 text-blue-700', 'Kunjungan Langsung': 'bg-teal-50 text-teal-700' };
        const statusBadge = c.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors text-xs font-medium text-slate-600';
        tr.innerHTML = `
            <td class="px-4 py-3 font-bold text-slate-800">${c.nama_campaign}</td>
            <td class="px-4 py-3 text-slate-500">${c.lokasi || '-'}</td>
            <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${jenisBadge[c.jenis] || ''}">${c.jenis}</span></td>
            <td class="px-4 py-3 text-right font-bold text-slate-900 font-data-mono">${formatRp(c.budget_alokasi)}</td>
            <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadge}">${c.status}</span></td>
            <td class="px-4 py-3 text-center space-x-1">
                <button class="text-primary hover:bg-primary/10 p-1.5 rounded transition-colors" onclick="window.editCampaign(${c.id_campaign})"><span class="material-symbols-outlined text-[16px]">edit</span></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updateCampaignPaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updateCampaignPaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('pemasaran-pagination-info');
    const btnPrev = document.getElementById('pemasaran-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('pemasaran-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('pemasaran-pagination-pages');

    if (infoText) {
        if (total === 0) {
            infoText.textContent = `Menampilkan 0-0 dari 0 data`;
        } else {
            infoText.textContent = `Menampilkan ${start}-${end} dari ${total} data`;
        }
    }

    if (btnPrev) {
        btnPrev.disabled = campaignCurrentPage <= 1;
        btnPrev.onclick = () => {
            if (campaignCurrentPage > 1) {
                campaignCurrentPage--;
                renderCampaigns();
            }
        };
    }

    if (btnNext) {
        btnNext.disabled = campaignCurrentPage >= totalPages;
        btnNext.onclick = () => {
            if (campaignCurrentPage < totalPages) {
                campaignCurrentPage++;
                renderCampaigns();
            }
        };
    }

    if (pagesContainer) {
        pagesContainer.innerHTML = '';
        if (totalPages > 1) {
            const maxVisiblePages = 5;
            let startPage = Math.max(1, campaignCurrentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.className = `w-7 h-7 rounded-lg text-xs font-bold transition-colors ${i === campaignCurrentPage ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;
                btn.textContent = i.toString();
                btn.onclick = () => {
                    campaignCurrentPage = i;
                    renderCampaigns();
                };
                pagesContainer.appendChild(btn);
            }
        }
    }
}

function populateCampaignDropdown(): void {
    const select = document.getElementById('select-campaign') as HTMLSelectElement;
    if (!select) return;
    select.innerHTML = '<option value="">-- Tidak Terikat Kampanye --</option>';
    masterCampaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id_campaign.toString();
        opt.textContent = c.nama_campaign;
        select.appendChild(opt);
    });
}



// ============================================================
// LEAD DETAIL MODAL
// ============================================================
function openLeadDetail(lead: Lead): void {
    const modal = document.getElementById('modal-lead');
    const content = document.getElementById('modal-lead-content');
    const title = document.getElementById('modal-lead-title');
    const form = document.getElementById('form-lead') as HTMLFormElement;
    const sectionAkt = document.getElementById('section-aktivitas');

    if (!modal || !content || !form) return;

    if (title) title.textContent = `Detail: ${lead.nama_toko ?? '-'}`;
    (form.querySelector('[name="id_lead"]') as HTMLInputElement).value = lead.id_lead.toString();
    (form.querySelector('[name="nama_toko"]') as HTMLInputElement).value = lead.nama_toko ?? '';
    (form.querySelector('[name="kontak_person"]') as HTMLInputElement).value = lead.kontak_person ?? '';
    (form.querySelector('[name="no_telepon"]') as HTMLInputElement).value = lead.no_telepon ?? '';
    (form.querySelector('[name="id_campaign"]') as HTMLSelectElement).value = lead.id_campaign?.toString() || '';
    const estimasi = lead.estimasi_nilai_deal ?? 0;
    const inputEstimasiHidden = form.querySelector('#input-estimasi-hidden') as HTMLInputElement;
    const inputEstimasi = form.querySelector('#input-estimasi') as HTMLInputElement;
    
    if (inputEstimasiHidden) inputEstimasiHidden.value = estimasi.toString();
    if (inputEstimasi) inputEstimasi.value = estimasi > 0 ? new Intl.NumberFormat('id-ID').format(estimasi) : '';
    const isLocked = lead.status_pipeline === 'Won_Deal' || lead.status_pipeline === 'Lost';

    const inputs = form.querySelectorAll('input:not([type="hidden"]), select');
    inputs.forEach(el => {
        (el as HTMLInputElement).disabled = isLocked;
        if (isLocked) el.classList.add('bg-slate-50', 'text-slate-500');
        else el.classList.remove('bg-slate-50', 'text-slate-500');
    });

    const btnSubmit = document.getElementById('btn-submit-lead');
    const btnCancel = document.getElementById('btn-cancel-lead');
    if (btnSubmit && btnCancel) {
        if (isLocked) {
            btnSubmit.classList.add('hidden');
            btnCancel.textContent = 'Tutup';
            if (lead.status_pipeline === 'Won_Deal') {
                document.getElementById('btn-delete-lead')?.classList.add('hidden');
            } else {
                document.getElementById('btn-delete-lead')?.classList.remove('hidden');
            }
        } else {
            btnSubmit.classList.remove('hidden');
            btnCancel.textContent = 'Batal';
            document.getElementById('btn-delete-lead')?.classList.remove('hidden');
        }
    }

    sectionAkt?.classList.remove('hidden');
    loadAktivitas(lead.id_lead);

    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
}

async function loadAktivitas(leadId: number): Promise<void> {
    const timeline = document.getElementById('timeline-aktivitas');
    if (!timeline) return;
    timeline.innerHTML = '<p class="text-xs text-slate-400">Memuat...</p>';
    try {
        const r = await apiFetch<{ success: boolean; data: Aktivitas[] }>(`pemasaran/aktivitas/${leadId}`);
        if (r.success) {
            if (r.data.length === 0) { timeline.innerHTML = '<p class="text-xs text-slate-400 italic">Belum ada aktivitas.</p>'; return; }
            timeline.innerHTML = '';
            r.data.forEach(a => {
                const d = new Date(a.tanggal);
                const iconMap: Record<string, string> = { 'Telepon': 'call', 'Meeting': 'groups', 'Email': 'mail' };
                const div = document.createElement('div');
                div.className = 'flex gap-3 items-start';
                div.innerHTML = `
                    <span class="material-symbols-outlined text-[16px] text-primary mt-0.5 shrink-0">${iconMap[a.jenis_interaksi] || 'note'}</span>
                    <div class="flex-1">
                        <div class="flex items-center gap-2"><span class="text-[10px] font-bold text-slate-500 uppercase">${a.jenis_interaksi}</span><span class="text-[10px] text-slate-400">${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                        <p class="text-xs text-slate-700 mt-0.5">${a.catatan_hasil}</p>
                    </div>
                `;
                timeline.appendChild(div);
            });
        }
    } catch { timeline.innerHTML = '<p class="text-xs text-rose-500">Gagal memuat.</p>'; }
}

// ============================================================
// MODALS & FORMS
// ============================================================
function setupModals(): void {
    const modalLead = document.getElementById('modal-lead');
    const modalCampaign = document.getElementById('modal-campaign');
    const contentLead = document.getElementById('modal-lead-content');
    const contentCampaign = document.getElementById('modal-campaign-content');

    const closeLead = () => { if (modalLead && contentLead) { modalLead.classList.add('opacity-0'); contentLead.classList.add('scale-95'); setTimeout(() => { modalLead.classList.add('hidden'); (document.getElementById('form-lead') as HTMLFormElement)?.reset(); document.getElementById('section-aktivitas')?.classList.add('hidden'); }, 300); } };
    const closeCampaign = () => { if (modalCampaign && contentCampaign) { modalCampaign.classList.add('opacity-0'); contentCampaign.classList.add('scale-95'); setTimeout(() => { modalCampaign.classList.add('hidden'); (document.getElementById('form-campaign') as HTMLFormElement)?.reset(); }, 300); } };

    document.getElementById('btn-close-lead')?.addEventListener('click', closeLead);
    document.getElementById('btn-cancel-lead')?.addEventListener('click', closeLead);
    modalLead?.addEventListener('click', (e) => { if (e.target === modalLead) closeLead(); });

    document.getElementById('btn-close-campaign')?.addEventListener('click', closeCampaign);
    document.getElementById('btn-cancel-campaign')?.addEventListener('click', closeCampaign);
    modalCampaign?.addEventListener('click', (e) => { if (e.target === modalCampaign) closeCampaign(); });

    // Format Budget Input
    const budgetInput = document.getElementById('input-camp-budget') as HTMLInputElement;
    if (budgetInput) {
        budgetInput.addEventListener('input', function(e) {
            let val = this.value.replace(/\D/g, '');
            if (val) {
                this.value = parseInt(val, 10).toLocaleString('id-ID');
            } else {
                this.value = '';
            }
        });
    }

    // Open Lead Modal (New)
    document.getElementById('btn-add-lead')?.addEventListener('click', () => {
        const title = document.getElementById('modal-lead-title');
        if (title) title.textContent = 'Tambah Lead Baru';
        (document.getElementById('form-lead') as HTMLFormElement)?.reset();
        (document.getElementById('input-lead-id') as HTMLInputElement).value = '';
        document.getElementById('section-aktivitas')?.classList.add('hidden');
        document.getElementById('btn-delete-lead')?.classList.add('hidden');
        if (modalLead && contentLead) { modalLead.classList.remove('hidden'); setTimeout(() => { modalLead.classList.remove('opacity-0'); contentLead.classList.remove('scale-95'); }, 10); }
    });

    // Open Campaign Modal
    document.getElementById('btn-add-campaign')?.addEventListener('click', () => {
        const formCamp = document.getElementById('form-campaign') as HTMLFormElement;
        formCamp?.reset();
        (document.getElementById('input-campaign-id') as HTMLInputElement).value = '';
        
        // Auto-fill dates
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
        (document.getElementById('input-camp-mulai') as HTMLInputElement).value = today;
        (document.getElementById('input-camp-selesai') as HTMLInputElement).value = nextWeek;
        
        document.getElementById('section-status-campaign')?.classList.add('hidden');
        document.getElementById('btn-delete-campaign')?.classList.add('hidden');
        document.getElementById('modal-campaign-title')!.textContent = 'Buat Kampanye Baru';

        if (modalCampaign && contentCampaign) { modalCampaign.classList.remove('hidden'); setTimeout(() => { modalCampaign.classList.remove('opacity-0'); contentCampaign.classList.remove('scale-95'); }, 10); }
    });

    // Delete Campaign Listener
    document.getElementById('btn-delete-campaign')?.addEventListener('click', () => {
        const campId = (document.getElementById('input-campaign-id') as HTMLInputElement).value;
        if (!campId) return;
        showConfirm('Hapus Kampanye', 'Apakah Anda yakin ingin menghapus kampanye ini? Aksi ini tidak dapat dibatalkan.', async () => {
            try {
                const r = await apiFetch<ActionRes>(`pemasaran/campaigns/${campId}`, { method: 'DELETE' });
                if (r.success) {
                    showToast(r.message); closeCampaign(); loadCampaigns();
                } else {
                    showToast(r.message, true);
                }
            } catch { showToast('Gagal menghapus kampanye.', true); }
        });
    });

    // Validasi No Telepon (Harus Angka & Berawalan 0)
    const inputTelepon = document.getElementById('input-no-telepon') as HTMLInputElement;
    if (inputTelepon) {
        inputTelepon.addEventListener('input', (e) => {
            let value = (e.target as HTMLInputElement).value;
            
            // Konversi format +62 atau 62 menjadi 0
            if (value.startsWith('+62')) value = '0' + value.slice(3);
            else if (value.startsWith('62')) value = '0' + value.slice(2);
            
            // Hapus semua karakter selain angka
            value = value.replace(/\D/g, '');
            
            // Wajib diawali angka 0
            if (value.length > 0 && !value.startsWith('0')) {
                value = '0' + value;
            }
            
            (e.target as HTMLInputElement).value = value;
        });
    }

    // Format Estimasi Nilai Deal
    const inputEstimasi = document.getElementById('input-estimasi') as HTMLInputElement;
    const inputEstimasiHidden = document.getElementById('input-estimasi-hidden') as HTMLInputElement;

    if (inputEstimasi && inputEstimasiHidden) {
        inputEstimasi.addEventListener('input', (e) => {
            let value = (e.target as HTMLInputElement).value;
            // Hapus semua karakter selain angka
            value = value.replace(/\D/g, '');
            
            // Cegah angka 0 di awal
            if (value.startsWith('0')) {
                value = value.replace(/^0+/, '');
            }

            // Batasi maksimal 1 miliar (1000000000)
            if (parseInt(value, 10) > 1000000000) {
                value = '1000000000';
            }

            // Update hidden input dengan angka murni
            inputEstimasiHidden.value = value || '0';

            // Format tampilan dengan titik separator
            if (value) {
                (e.target as HTMLInputElement).value = new Intl.NumberFormat('id-ID').format(parseInt(value, 10));
            } else {
                (e.target as HTMLInputElement).value = '';
            }
        });
    }

    // Submit Lead
    (document.getElementById('form-lead') as HTMLFormElement)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        delete payload.estimasi_nilai_deal_formatted; // Hapus input visual dari payload
        const leadId = payload.id_lead as string;
        try {
            if (leadId) {
                await apiFetch<ActionRes>(`pemasaran/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(payload) });
                showToast('Detail lead diperbarui.');
            } else {
                const r = await apiFetch<ActionRes>('pemasaran/leads', { method: 'POST', body: JSON.stringify(payload) });
                showToast(r.message);
            }
            closeLead();
            await Promise.all([loadLeads(), loadKPI()]);
        } catch { showToast('Gagal menyimpan lead.', true); }
    });

    // Delete Lead
    document.getElementById('btn-delete-lead')?.addEventListener('click', () => {
        const leadId = (document.getElementById('input-lead-id') as HTMLInputElement)?.value;
        if (!leadId) return;
        
        showConfirm(
            'Hapus Lead',
            'Apakah Anda yakin ingin menghapus lead ini secara permanen? Seluruh histori aktivitas akan ikut terhapus.',
            async () => {
                try {
                    const r = await apiFetch<ActionRes>(`pemasaran/leads/${leadId}`, { method: 'DELETE' });
                    if (r.success) {
                        showToast(r.message);
                        const modalLead = document.getElementById('modal-lead');
                        const contentLead = document.getElementById('modal-lead-content');
                        if (modalLead && contentLead) { modalLead.classList.add('opacity-0'); contentLead.classList.add('scale-95'); setTimeout(() => { modalLead.classList.add('hidden'); (document.getElementById('form-lead') as HTMLFormElement)?.reset(); document.getElementById('section-aktivitas')?.classList.add('hidden'); }, 300); }
                        await Promise.all([loadLeads(), loadKPI()]);
                    } else {
                        showToast(r.message, true);
                    }
                } catch {
                    showToast('Gagal menghapus lead.', true);
                }
            }
        );
    });

    // Submit Campaign
    (document.getElementById('form-campaign') as HTMLFormElement)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const payload = Object.fromEntries(fd.entries());
        if (payload.budget_alokasi) {
            payload.budget_alokasi = (payload.budget_alokasi as string).replace(/\./g, '');
        }
        const campId = payload.id_campaign as string;
        try {
            if (campId) {
                const r = await apiFetch<ActionRes>(`pemasaran/campaigns/${campId}`, { method: 'PATCH', body: JSON.stringify(payload) });
                if (r.success) { showToast(r.message); closeCampaign(); loadCampaigns(); } else { showToast(r.message, true); }
            } else {
                const r = await apiFetch<ActionRes>('pemasaran/campaigns', { method: 'POST', body: JSON.stringify(payload) });
                if (r.success) { showToast(r.message); closeCampaign(); loadCampaigns(); } else { showToast(r.message, true); }
            }
        } catch { showToast('Gagal memproses kampanye.', true); }
    });

    // Add Aktivitas
    document.getElementById('btn-add-aktivitas')?.addEventListener('click', async () => {
        const leadId = (document.getElementById('input-lead-id') as HTMLInputElement)?.value;
        const jenis = (document.getElementById('input-jenis-interaksi') as HTMLSelectElement)?.value;
        const catatan = (document.getElementById('input-catatan') as HTMLInputElement)?.value;
        if (!leadId || !catatan) { showToast('Isi catatan terlebih dahulu.', true); return; }
        try {
            const r = await apiFetch<ActionRes>('pemasaran/aktivitas', { method: 'POST', body: JSON.stringify({ id_lead: leadId, jenis_interaksi: jenis, catatan_hasil: catatan }) });
            if (r.success) { showToast(r.message); (document.getElementById('input-catatan') as HTMLInputElement).value = ''; loadAktivitas(parseInt(leadId, 10)); }
            else { showToast(r.message, true); }
        } catch { showToast('Gagal mencatat aktivitas.', true); }
    });


}

// ============================================================
// TABS
// ============================================================
function setupTabs(): void {
    const tabPipeline = document.getElementById('tab-pipeline');
    const tabCampaigns = document.getElementById('tab-campaigns');
    
    const viewPipeline = document.getElementById('view-pipeline');
    const viewCampaigns = document.getElementById('view-campaigns');
    
    const activeClass = 'pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors';
    const inactiveClass = 'pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors';

    const switchTab = (tabName: 'pipeline' | 'campaigns') => {
        let activeTab: HTMLElement;
        let inactiveTabs: HTMLElement[];
        let activeView: HTMLElement;
        let inactiveViews: HTMLElement[];

        if (tabName === 'pipeline') {
            activeTab = tabPipeline!;
            inactiveTabs = [tabCampaigns!];
            activeView = viewPipeline!;
            inactiveViews = [viewCampaigns!];
        } else {
            activeTab = tabCampaigns!;
            inactiveTabs = [tabPipeline!];
            activeView = viewCampaigns!;
            inactiveViews = [viewPipeline!];
            loadCampaigns();
        }

        activeTab.className = activeClass;
        inactiveTabs.forEach(t => t.className = inactiveClass);
        activeView.classList.remove('hidden');
        inactiveViews.forEach(v => v.classList.add('hidden'));
        
        localStorage.setItem('pemasaranLastTab', tabName);
    };

    tabPipeline?.addEventListener('click', () => switchTab('pipeline'));
    tabCampaigns?.addEventListener('click', () => switchTab('campaigns'));
    
    const lastTab = localStorage.getItem('pemasaranLastTab');
    if (lastTab === 'campaigns') {
        switchTab('campaigns');
    } else {

        switchTab('pipeline');
    }

    // Remove anti-flicker style once tabs are properly initialized
    const antiFlicker = document.getElementById('anti-flicker');
    if (antiFlicker) antiFlicker.remove();
}

// ============================================================
// DYNAMIC PRINT SHEET
// ============================================================
interface PrintData {
    namaKlien: string;
    noSurat: string;
    item: string;
    qty: number;
    hargaSatuan: number;
}

function cetakSuratPenawaran(data: PrintData): void {
    const total = data.qty * data.hargaSatuan;
    
    // Currency format helper
    const formatRp = (num: number) => new Intl.NumberFormat('id-ID').format(num);

    // Inject values into DOM
    const elNama = document.getElementById('pdf-klien-nama');
    const elNoSurat = document.getElementById('pdf-no-surat');
    const elItem = document.getElementById('pdf-item-deskripsi');
    const elQty = document.getElementById('pdf-item-qty');
    const elHarga = document.getElementById('pdf-item-harga');
    const elTotal = document.getElementById('pdf-total-harga');
    const elGrandTotal = document.getElementById('pdf-grand-total');

    if (elNama) elNama.innerText = data.namaKlien;
    if (elNoSurat) elNoSurat.innerText = data.noSurat;
    if (elItem) elItem.innerText = data.item;
    if (elQty) elQty.innerText = data.qty.toString();
    if (elHarga) elHarga.innerText = formatRp(data.hargaSatuan);
    if (elTotal) elTotal.innerText = formatRp(total);
    if (elGrandTotal) elGrandTotal.innerText = formatRp(total);

    // Secret Feature: Change Document Title temporarily so PDF saves with this name
    const originalTitle = document.title;
    const safeTitle = data.namaKlien.replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `Penawaran_${safeTitle}`;

    // Add a slight delay to ensure DOM updates render before print dialog opens
    setTimeout(() => {
        window.print();
        // Restore title after print dialog closes
        document.title = originalTitle;
    }, 50);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-pemasaran');
    if (!user) return;
    setupTabs();
    setupModals();
    setupDragDrop();
    loadKPI();
    loadLeads();
    loadCampaigns();

    // Print Logic
    document.getElementById('btn-print-penawaran')?.addEventListener('click', () => {
        cetakSuratPenawaran({
            namaKlien: "PT Nusantara Jaya",
            noSurat: "PNW/MTK/2026/099",
            item: "Motekar Premium Commuter Fleet",
            qty: 15,
            hargaSatuan: 16500000
        });
    });

    // Polling for Real-Time Experience (Every 30 seconds)
    setInterval(() => {
        const tab = localStorage.getItem('pemasaranLastTab') || 'pipeline';
        if (tab === 'pipeline') {
            loadKPI();
            loadLeads();
        } else if (tab === 'campaigns') {
            loadCampaigns();
        }
    }, 30000);
});


// ============================================================
// CETAK PENAWARAN MODAL
// ============================================================
const modalCetak = document.getElementById('modal-cetak');
const contentCetak = document.getElementById('modal-cetak-content');

const closeCetak = () => {
    if (modalCetak && contentCetak) {
        modalCetak.classList.add('opacity-0');
        contentCetak.classList.add('scale-95');
        setTimeout(() => {
            modalCetak.classList.add('hidden');
            (document.getElementById('form-cetak') as HTMLFormElement)?.reset();
        }, 300);
    }
};

document.getElementById('btn-close-cetak')?.addEventListener('click', closeCetak);
document.getElementById('btn-cancel-cetak')?.addEventListener('click', closeCetak);
modalCetak?.addEventListener('click', (e) => { if (e.target === modalCetak) closeCetak(); });

document.getElementById('btn-cetak-penawaran')?.addEventListener('click', () => {
    const selectLead = document.getElementById('input-cetak-lead') as HTMLSelectElement;
    if (selectLead) {
        selectLead.innerHTML = '<option value="">-- Pilih Lead --</option>';
        masterLeads.forEach(lead => {
            if (lead.status_pipeline !== 'Lost') {
                const opt = document.createElement('option');
                opt.value = lead.id_lead.toString();
                opt.textContent = lead.nama_toko || 'Unknown';
                selectLead.appendChild(opt);
            }
        });
    }

    if (modalCetak && contentCetak) {
        modalCetak.classList.remove('hidden');
        setTimeout(() => {
            modalCetak.classList.remove('opacity-0');
            contentCetak.classList.remove('scale-95');
        }, 10);
    }
});

(document.getElementById('form-cetak') as HTMLFormElement)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const leadId = (document.getElementById('input-cetak-lead') as HTMLSelectElement).value;
    const item = (document.getElementById('input-cetak-item') as HTMLInputElement).value;
    const qty = parseInt((document.getElementById('input-cetak-qty') as HTMLInputElement).value, 10);
    const harga = parseInt((document.getElementById('input-cetak-harga') as HTMLInputElement).value, 10);
    
    const lead = masterLeads.find(x => x.id_lead.toString() === leadId);
    if (!lead) return;

    // Generate Nomor Surat Random (atau berurutan)
    const randomNum = Math.floor(100 + Math.random() * 900);
    const noSurat = `PNW/MTK/2026/${randomNum}`;

    cetakSuratPenawaran({
        namaKlien: lead.nama_toko || 'Klien',
        noSurat: noSurat,
        item: item,
        qty: qty,
        hargaSatuan: harga
    });

    closeCetak();
});


(window as any).editCampaign = (id: number) => {
    const c = masterCampaigns.find(x => x.id_campaign === id);
    if (!c) return;
    
    const formCamp = document.getElementById('form-campaign') as HTMLFormElement;
    formCamp?.reset();
    (document.getElementById('input-campaign-id') as HTMLInputElement).value = c.id_campaign.toString();
    (formCamp.querySelector('[name="nama_campaign"]') as HTMLInputElement).value = c.nama_campaign;
    (formCamp.querySelector('[name="lokasi"]') as HTMLInputElement).value = c.lokasi || '';
    (formCamp.querySelector('[name="jenis"]') as HTMLSelectElement).value = c.jenis;
    (formCamp.querySelector('[name="budget_alokasi"]') as HTMLInputElement).value = Number(c.budget_alokasi).toLocaleString('id-ID');
    (formCamp.querySelector('[name="tanggal_mulai"]') as HTMLInputElement).value = c.tanggal_mulai || '';
    (formCamp.querySelector('[name="tanggal_selesai"]') as HTMLInputElement).value = c.tanggal_selesai || '';
    (formCamp.querySelector('[name="status"]') as HTMLSelectElement).value = c.status;

    document.getElementById('section-status-campaign')?.classList.remove('hidden');
    document.getElementById('btn-delete-campaign')?.classList.remove('hidden');
    
    const title = document.getElementById('modal-campaign-title');
    if (title) title.textContent = 'Edit Kampanye';

    const modalCampaign = document.getElementById('modal-campaign');
    const contentCampaign = document.getElementById('modal-campaign-content');
    if (modalCampaign && contentCampaign) { modalCampaign.classList.remove('hidden'); setTimeout(() => { modalCampaign.classList.remove('opacity-0'); contentCampaign.classList.remove('scale-95'); }, 10); }
};
