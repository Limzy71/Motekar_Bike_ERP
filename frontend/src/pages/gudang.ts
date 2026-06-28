/**
 * gudang.ts — Logic untuk halaman Gudang & Inventori.
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';
import { renderPaginationUI } from '../utils/pagination.js';

interface InventoryItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  tipe_item: string;
  jumlah_stok: number;
  satuan: string;
  last_updated: string;
}

interface GudangResponse {
  success: boolean;
  data: InventoryItem[];
  message?: string;
}

interface OutboundSO {
  id: number;
  nomor_so: string;
  nama_customer: string;
  alamat_pengiriman: string;
  status_so: string;
  items: any[];
}

interface ActionResponse {
  success: boolean;
  message: string;
}

// Global memory untuk instan filter & search
let masterStok: InventoryItem[] = [];
let currentFilter: string = 'Semua';
let currentSearch: string = '';
let outboundSOs: OutboundSO[] = [];

let currentPage = 1;
const itemsPerPage = 10;

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadGudang(): Promise<void> {
  const tbody = document.getElementById('tbody-gudang');
  if (!tbody) return;

  try {
    const response = await apiFetch<GudangResponse>('gudang');

    if (response.success) {
      masterStok = response.data;
      renderTable();
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data: ${response.message}</td></tr>`;
      showToast(response.message || 'Gagal memuat data Gudang', true);
    }
  } catch (err) {
    console.error('loadGudang error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-rose-600">Terjadi kesalahan koneksi jaringan.</td></tr>`;
    showToast('Terjadi kesalahan jaringan.', true);
  }
}

function renderTable(): void {
  const tbody = document.getElementById('tbody-gudang');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Filter & Search Logic
  const filteredData = masterStok.filter(item => {
    // 1. Kategori Filter (Berdasarkan tipe_item)
    let matchCategory = true;
    if (currentFilter !== 'Semua') {
      const filterTipe = currentFilter === 'WIP' ? 'SA' : currentFilter;
      matchCategory = item.tipe_item === filterTipe;
    }
    
    // 2. Search Filter (kode atau nama)
    const searchTerm = currentSearch.toLowerCase();
    const matchSearch = currentSearch === '' || 
                        item.kode_barang.toLowerCase().includes(searchTerm) || 
                        item.nama_barang.toLowerCase().includes(searchTerm);
    
    return matchCategory && matchSearch;
  });

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada data stok yang sesuai.</td></tr>`;
    renderPaginationUI('gudang-pagination-pagination', 'gudang-pagination-info', 1, 10, 0, () => {});
    return;
  }

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  currentItems.forEach(item => {
    // Dynamic Stock Badges (MEDS Kunci UX)
    let statusBadge = '';
    const isKritis = item.jumlah_stok <= 10; // ROP logic simplified for now
    if (isKritis) {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-rose-50 text-rose-700 border-rose-200/80">Kritis</span>`;
    } else {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Aman</span>`;
    }

    let lokasi = "Gudang Utama";
    if (item.kategori === 'WIP' || item.tipe_item === 'SA' || item.kategori === 'Barang Setengah Jadi') {
        lokasi = "Meja Perakitan";
    } else if (item.kategori === 'FG' || item.kategori === 'Sepeda Jadi' || item.kategori === 'Barang Jadi') {
        lokasi = "Gudang Barang Jadi";
    }
    const lokasiBadge = `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap"><span class="material-symbols-outlined text-[14px]">location_on</span> ${lokasi}</span>`;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-100 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
    tr.innerHTML = `
        <td class="px-4 py-3">
            <p class="font-semibold text-slate-900 font-data-mono">${item.kode_barang}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.nama_barang}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.kategori}</p>
        </td>
        <td class="px-4 py-3">
            ${lokasiBadge}
        </td>
        <td class="px-4 py-3">
            <p class="font-bold text-slate-900">${item.jumlah_stok}</p>
        </td>
        <td class="px-4 py-3">
            <p>${item.satuan}</p>
        </td>
        <td class="px-4 py-3">
            ${statusBadge}
        </td>
    `;
    tbody.appendChild(tr);
  });
    renderPaginationUI(
        'gudang-pagination-pagination',
        'gudang-pagination-info',
        currentPage,
        itemsPerPage,
        totalItems,
        (newPage) => {
            currentPage = newPage;
            renderTable();
        }
    );
}



// ============================================================
// FILTER & SEARCH HANDLERS
// ============================================================

function setupFilters(): void {
  // Search Input
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = (e.target as HTMLInputElement).value;
      currentPage = 1;
      renderTable(); // Instan re-render
    });
  }

  // Category Pills
  const categoryPills = document.querySelectorAll('.filter-btn');
  categoryPills.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const filter = target.getAttribute('data-filter') || 'Semua';
      currentFilter = filter;

      // Update styling
      categoryPills.forEach(p => {
        p.classList.remove('bg-slate-900', 'text-white', 'shadow-2xs');
        p.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200/70');
      });

      target.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200/70');
      target.classList.add('bg-slate-900', 'text-white', 'shadow-2xs');

      currentPage = 1;
      renderTable(); // Instan re-render
    });
  });

  // Tab Logic
  const tabMaster = document.getElementById('tab-master');
  const tabOutbound = document.getElementById('tab-outbound');
  const tabException = document.getElementById('tab-exception');
  const tabReceipt = document.getElementById('tab-receipt');
  const sectionMaster = document.getElementById('section-master');
  const sectionOutbound = document.getElementById('section-outbound');
  const sectionException = document.getElementById('section-exception');
  const sectionReceipt = document.getElementById('section-receipt');

  const activeClass = "px-6 py-3 border-b-2 border-primary text-primary font-bold text-sm transition-colors";
  const inactiveClass = "px-6 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors";
  const exceptionActiveClass = "px-6 py-3 border-b-2 border-rose-500 text-rose-600 font-bold text-sm transition-colors";
  const exceptionInactiveClass = "px-6 py-3 border-b-2 border-transparent text-rose-500 hover:text-rose-700 font-bold text-sm transition-colors";

  const switchTab = (tabName: 'master' | 'outbound' | 'exception' | 'receipt') => {
      if (tabMaster) tabMaster.className = inactiveClass;
      if (tabOutbound) tabOutbound.className = inactiveClass + " flex items-center gap-2";
      if (tabException) tabException.className = exceptionInactiveClass + " flex items-center gap-2";
      if (tabReceipt) tabReceipt.className = inactiveClass + " flex items-center gap-2";
      sectionMaster?.classList.add('hidden');
      sectionOutbound?.classList.add('hidden');
      sectionException?.classList.add('hidden');
      sectionReceipt?.classList.add('hidden');

      if (tabName === 'master') {
          if (tabMaster) tabMaster.className = activeClass;
          sectionMaster?.classList.remove('hidden');
          localStorage.setItem('gudangLastTab', 'master');
      } else if (tabName === 'outbound') {
          if (tabOutbound) tabOutbound.className = activeClass + " flex items-center gap-2";
          sectionOutbound?.classList.remove('hidden');
          localStorage.setItem('gudangLastTab', 'outbound');
          loadOutboundLogistics();
      } else if (tabName === 'exception') {
          if (tabException) tabException.className = exceptionActiveClass + " flex items-center gap-2";
          sectionException?.classList.remove('hidden');
          localStorage.setItem('gudangLastTab', 'exception');
          loadWriteOffs();
      } else if (tabName === 'receipt') {
          if (tabReceipt) tabReceipt.className = activeClass + " flex items-center gap-2";
          sectionReceipt?.classList.remove('hidden');
          localStorage.setItem('gudangLastTab', 'receipt');
          loadPendingPO();
      }
  };

  tabMaster?.addEventListener('click', () => switchTab('master'));
  tabOutbound?.addEventListener('click', () => switchTab('outbound'));
  tabException?.addEventListener('click', () => switchTab('exception'));
  tabReceipt?.addEventListener('click', () => switchTab('receipt'));

  const lastTab = localStorage.getItem('gudangLastTab');
  if (lastTab === 'outbound') {
      switchTab('outbound');
  } else if (lastTab === 'exception') {
      switchTab('exception');
  } else if (lastTab === 'receipt') {
      switchTab('receipt');
  } else {
      switchTab('master');
  }

  // Remove anti-flicker style once tabs are properly initialized
  const antiFlicker = document.getElementById('anti-flicker');
  if (antiFlicker) antiFlicker.remove();
}

// ============================================================
// OUTBOUND LOGISTICS HANDLERS
// ============================================================

async function loadOutboundLogistics(): Promise<void> {
  const tbody = document.getElementById('tbody-outbound');
  if (!tbody) return;

  try {
      const response = await apiFetch<{success: boolean, data: OutboundSO[]}>('sales/orders');
      if (response && response.success) {
          // Filter RESERVED or SHIPPED (for exception handling)
          outboundSOs = response.data.filter(so => so.status_so === 'RESERVED' || so.status_so === 'SHIPPED');
          
          const badge = document.getElementById('badge-outbound');
          if (badge) {
              if (outboundSOs.length > 0) {
                  badge.textContent = outboundSOs.length.toString();
                  badge.classList.remove('hidden');
              } else {
                  badge.classList.add('hidden');
              }
          }
          renderOutboundTable();
      } else {
          tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data SO.</td></tr>`;
      }
  } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Kesalahan jaringan.</td></tr>`;
  }
}

function renderOutboundTable() {
    const tbody = document.getElementById('tbody-outbound');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (outboundSOs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Tidak ada antrean pengiriman 3PL saat ini.</td></tr>`;
        return;
    }

    outboundSOs.forEach(so => {
        let totalItems = 0;
        if (so.items) {
            totalItems = so.items.reduce((sum, item) => sum + parseInt(item.qty || '0', 10), 0);
        }

        let aksiButtons = '';
        if (so.status_so === 'RESERVED') {
            aksiButtons = `
                <button onclick="window.openDispatchModal(${so.id}, '${so.nomor_so}')" class="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mx-auto">
                    <span class="material-symbols-outlined text-[16px]">local_shipping</span> Dispatch
                </button>
            `;
        } else if (so.status_so === 'SHIPPED') {
            aksiButtons = `
                <button onclick="window.reportFailedDelivery(${so.id})" class="px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mx-auto">
                    <span class="material-symbols-outlined text-[16px]">warning</span> Gagal Kirim
                </button>
            `;
        }

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-100 transition-colors";
        tr.innerHTML = `
            <td class="px-4 py-4 whitespace-nowrap"><p class="font-bold text-blue-700">${so.nomor_so}</p></td>
            <td class="px-4 py-4"><p class="font-semibold text-slate-800">${so.nama_customer}</p></td>
            <td class="px-4 py-4"><p class="text-slate-600 truncate max-w-[200px]" title="${so.alamat_pengiriman}">${so.alamat_pengiriman}</p></td>
            <td class="px-4 py-4 text-right"><p class="font-data-mono font-bold">${totalItems}</p></td>
            <td class="px-4 py-4 text-center">
                ${aksiButtons}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

(window as any).openDispatchModal = (id: number, no_so: string) => {
    const modal = document.getElementById('modal-dispatch-3pl');
    const modalContent = document.getElementById('modal-dispatch-content');
    
    (document.getElementById('input-dispatch-so-id') as HTMLInputElement).value = id.toString();
    (document.getElementById('input-dispatch-so-no') as HTMLInputElement).value = no_so;
    (document.getElementById('input-vendor-3pl') as HTMLInputElement).value = '';
    (document.getElementById('input-resi-3pl') as HTMLInputElement).value = '';
    (document.getElementById('input-foto-3pl') as HTMLInputElement).value = '';

    if (modal && modalContent) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
};

function setupModalDispatch(): void {
    const modal = document.getElementById('modal-dispatch-3pl');
    const modalContent = document.getElementById('modal-dispatch-content');
    const btnClose = document.getElementById('btn-close-dispatch');
    const btnCancel = document.getElementById('btn-cancel-dispatch');
    const form = document.getElementById('form-dispatch') as HTMLFormElement;

    const closeModal = () => {
        if (modal && modalContent) {
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
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
        
        const id = (document.getElementById('input-dispatch-so-id') as HTMLInputElement).value;
        const vendor = (document.getElementById('input-vendor-3pl') as HTMLInputElement).value;
        const resi = (document.getElementById('input-resi-3pl') as HTMLInputElement).value;
        const fileInput = document.getElementById('input-foto-3pl') as HTMLInputElement;

        if (!vendor || !resi || !fileInput.files || fileInput.files.length === 0) {
            showToast('Form tidak lengkap atau foto belum diunggah!', true);
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-dispatch') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-dispatch');
        
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.classList.add('opacity-80', 'cursor-wait'); }
        if (spinner) { spinner.classList.remove('hidden'); spinner.classList.add('animate-spin'); }

        try {
            // Convert file to Base64 (e-POD Digital Evidence)
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Foto = reader.result as string;

                try {
                    const response = await apiFetch<ActionResponse>(`sales/orders/${id}/ship`, {
                      method: 'PATCH',
                      body: JSON.stringify({ vendor, resi, foto: base64Foto })
                    });

                    if (response.success) {
                        showToast(response.message);
                        closeModal();
                        loadOutboundLogistics(); // Refresh table
                    } else {
                        showToast(response.message, true);
                    }
                } catch (apiErr) {
                    showToast('Terjadi kesalahan koneksi API.', true);
                } finally {
                    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
                    if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
                }
            };
            reader.onerror = () => {
                showToast('Gagal membaca file foto.', true);
                if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
                if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
            };

        } catch (err) {
            showToast('Terjadi kesalahan memproses foto.', true);
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
            if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
        }
    });
}

// ============================================================
// MODAL (BARANG MASUK) HANDLERS
// ============================================================

function setupModalInbound(): void {
  const modal = document.getElementById('modal-inbound');
  const modalContent = document.getElementById('modal-inbound-content');
  const btnOpen = document.getElementById('btn-open-modal-masuk');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const form = document.getElementById('form-barang-masuk') as HTMLFormElement;

  const modeRadios = document.querySelectorAll('input[name="mode_barang"]');
  const inputNama = document.getElementById('input-nama') as HTMLInputElement;
  const inputKategori = document.getElementById('input-kategori') as HTMLSelectElement;
  const inputSatuan = document.getElementById('input-satuan') as HTMLSelectElement;
  const inputKode = document.getElementById('input-kode') as HTMLInputElement;

  // Open Modal
  btnOpen?.addEventListener('click', () => {
    if (modal && modalContent) {
      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
      }, 10);
    }
  });

  // Close Modal
  const closeModal = () => {
    if (modal && modalContent) {
      modal.classList.add('opacity-0');
      modalContent.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        form?.reset();
        resetMode();
      }, 300);
    }
  };

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Close on outside click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Mode Switch Logic
  const resetMode = () => {
    // Default is Existing: nama, kategori, satuan disabled. User only inputs kode and jumlah
    inputNama.disabled = true;
    inputNama.classList.add('bg-slate-50', 'text-slate-400');
    inputKategori.disabled = true;
    inputKategori.classList.add('bg-slate-50', 'text-slate-400');
    inputSatuan.disabled = true;
    inputSatuan.classList.add('bg-slate-50', 'text-slate-400');
    
    // Auto-fill trigger from kode
    inputKode.addEventListener('blur', handleAutoFill);
  };

  const handleAutoFill = () => {
    const isExisting = (document.querySelector('input[name="mode_barang"]:checked') as HTMLInputElement).value === 'existing';
    if (!isExisting) return;

    const kode = inputKode.value.trim().toUpperCase();
    const found = masterStok.find(s => s.kode_barang.toUpperCase() === kode);
    
    if (found) {
      inputNama.value = found.nama_barang;
      inputKategori.value = found.kategori;
      inputSatuan.value = found.satuan;
    } else {
      inputNama.value = '';
    }
  };

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = (e.target as HTMLInputElement).value;
      if (mode === 'baru') {
        inputNama.disabled = false;
        inputNama.classList.remove('bg-slate-50', 'text-slate-400');
        inputNama.value = '';
        inputKategori.disabled = false;
        inputKategori.classList.remove('bg-slate-50', 'text-slate-400');
        inputSatuan.disabled = false;
        inputSatuan.classList.remove('bg-slate-50', 'text-slate-400');
        inputKode.removeEventListener('blur', handleAutoFill);
      } else {
        resetMode();
      }
    });
  });

  // Init mode state
  resetMode();

  // Form Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const spinner = document.getElementById('spinner-masuk');
    const btnSubmit = document.getElementById('btn-submit-masuk') as HTMLButtonElement;

    // Kumpulkan data. Disabled inputs not included in FormData, so we build it manually or enable them temporarily.
    inputNama.disabled = false;
    inputKategori.disabled = false;
    inputSatuan.disabled = false;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Restore disabled state if needed
    if ((document.querySelector('input[name="mode_barang"]:checked') as HTMLInputElement).value === 'existing') {
      inputNama.disabled = true;
      inputKategori.disabled = true;
      inputSatuan.disabled = true;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add('opacity-80', 'cursor-wait');
    }
    if (spinner) {
      spinner.classList.remove('hidden');
      spinner.classList.add('animate-spin');
    }

    try {
      const response = await apiFetch<ActionResponse>('gudang/masuk', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        showToast(response.message);
        closeModal();
        // Seamless background re-fetch
        loadGudang();
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal memproses barang masuk.', true);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-80', 'cursor-wait');
      }
      if (spinner) {
        spinner.classList.add('hidden');
        spinner.classList.remove('animate-spin');
      }
    }
  });
}

// ============================================================
// MODAL OPNAME HANDLERS
// ============================================================

(window as any).openOpname = (id: number) => {
    const item = masterStok.find(x => x.id === id);
    if (!item) return;

    const modal = document.getElementById('modal-opname');
    const modalContent = document.getElementById('modal-opname-content');
    
    (document.getElementById('input-opname-id') as HTMLInputElement).value = item.id.toString();
    (document.getElementById('input-opname-nama') as HTMLInputElement).value = `${item.kode_barang} - ${item.nama_barang}`;
    (document.getElementById('input-opname-stok-sistem') as HTMLInputElement).value = item.jumlah_stok.toString();
    (document.getElementById('input-opname-stok-aktual') as HTMLInputElement).value = item.jumlah_stok.toString();

    if (modal && modalContent) {
      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
      }, 10);
    }
};

function setupModalOpname(): void {
  const modal = document.getElementById('modal-opname');
  const modalContent = document.getElementById('modal-opname-content');
  const btnClose = document.getElementById('btn-close-opname');
  const btnCancel = document.getElementById('btn-cancel-opname');
  const form = document.getElementById('form-opname') as HTMLFormElement;

  const closeModal = () => {
    if (modal && modalContent) {
      modal.classList.add('opacity-0');
      modalContent.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        form?.reset();
      }, 300);
    }
  };

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-opname') as HTMLButtonElement;
    const spinner = document.getElementById('spinner-opname');
    const fd = new FormData(form);
    const id = fd.get('id_stok') as string;
    const jumlah_aktual = fd.get('jumlah_aktual') as string;

    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.classList.add('opacity-80', 'cursor-wait'); }
    if (spinner) { spinner.classList.remove('hidden'); spinner.classList.add('animate-spin'); }

    try {
      const response = await apiFetch<ActionResponse>(`gudang/opname/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ jumlah_aktual })
      });

      if (response.success) {
        showToast(response.message);
        closeModal();
        loadGudang();
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal memproses stock opname.', true);
    } finally {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
      if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
    }
  });

  document.getElementById('btn-opname')?.addEventListener('click', () => {
    if (typeof (window as any).Swal !== 'undefined') {
        (window as any).Swal.fire({
            icon: 'info',
            title: 'Fitur Stock Opname',
            text: 'Untuk melakukan penyesuaian stok fisik, silakan klik ikon "Edit/Pencil" di sebelah kanan pada baris barang yang bersangkutan di dalam tabel.',
            confirmButtonColor: '#0f172a',
            confirmButtonText: 'Mengerti'
        });
    } else {
        showToast('Pilih ikon edit pada baris barang untuk melakukan opname individual.');
    }
  });
}


// ============================================================
// EXCEPTION HANDLING (WRITE-OFF & FAILED DELIVERY)
// ============================================================

async function loadWriteOffs() {
    const tbody = document.getElementById('tbody-writeoff');
    if (!tbody) return;

    try {
        const response = await apiFetch<any>('exception/writeoff');
        if (response.success) {
            tbody.innerHTML = '';
            if (response.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Tidak ada antrean write-off.</td></tr>`;
                return;
            }
            response.data.forEach((wo: any) => {
                let badge = '';
                if (wo.status_approval === 'PENDING') badge = `<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">PENDING</span>`;
                else if (wo.status_approval === 'APPROVED') badge = `<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">APPROVED</span>`;
                else badge = `<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">REJECTED</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="px-4 py-3 font-data-mono font-bold text-rose-700">${wo.id_writeoff}</td>
                    <td class="px-4 py-3 font-semibold text-slate-800">${wo.kode_item}</td>
                    <td class="px-4 py-3 text-center font-data-mono font-bold">${wo.qty_hilang}</td>
                    <td class="px-4 py-3 text-slate-600 max-w-[200px] truncate" title="${wo.alasan_hilang}">${wo.alasan_hilang}</td>
                    <td class="px-4 py-3 text-center">${badge}</td>
                    <td class="px-4 py-3 text-center">
                        ${wo.status_approval === 'PENDING' && (localStorage.getItem('userRole') === 'Owner' || localStorage.getItem('userRole') === 'General Manager') ? 
                            `<button onclick="window.approveWriteoff(${wo.id_writeoff})" class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold hover:bg-emerald-600 hover:text-white transition-colors mr-1">Approve</button>
                             <button onclick="window.rejectWriteoff(${wo.id_writeoff})" class="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-bold hover:bg-rose-600 hover:text-white transition-colors">Reject</button>`
                        : ''}
                        <button onclick="window.open('http://localhost:3000/uploads/${wo.bukti_berita_acara}', '_blank')" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-600 hover:text-white transition-colors ml-1">Cetak / Lihat</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat write-off.</td></tr>`;
    }
}

function setupExceptionForms() {
    const btnAjukan = document.getElementById('btn-ajukan-writeoff');
    const modalWriteoff = document.getElementById('modal-writeoff');
    const modalContent = document.getElementById('modal-writeoff-content');
    const btnClose = document.getElementById('btn-close-writeoff');
    const btnCancel = document.getElementById('btn-cancel-writeoff');
    const btnSubmit = document.getElementById('btn-submit-writeoff');
    const selectItem = document.getElementById('wo-kode-item') as HTMLSelectElement;

    const openModal = () => {
        // Populate items
        if (selectItem) {
            selectItem.innerHTML = '<option value="">-- Pilih Item --</option>';
            masterStok.forEach(item => {
                selectItem.innerHTML += `<option value="${item.kode_barang}">${item.kode_barang} - ${item.nama_barang} (Stok: ${item.jumlah_stok})</option>`;
            });
        }
        modalWriteoff?.classList.remove('hidden');
        setTimeout(() => {
            modalWriteoff?.classList.remove('opacity-0');
            modalContent?.classList.remove('scale-95');
        }, 10);
    };

    const closeModal = () => {
        modalWriteoff?.classList.add('opacity-0');
        modalContent?.classList.add('scale-95');
        setTimeout(() => {
            modalWriteoff?.classList.add('hidden');
        }, 300);
    };

    btnAjukan?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    btnSubmit?.addEventListener('click', async () => {
        const kode_item = selectItem.value;
        const qty_hilang = (document.getElementById('wo-qty') as HTMLInputElement).value;
        const alasan_hilang = (document.getElementById('wo-alasan') as HTMLTextAreaElement).value;
        const fileInput = document.getElementById('wo-bukti') as HTMLInputElement;

        if (!kode_item || !qty_hilang || !alasan_hilang || !fileInput.files || fileInput.files.length === 0) {
            showToast('Lengkapi semua data dan unggah Berita Acara.', true);
            return;
        }

        try {
            const formData = new FormData();
            formData.append('kode_item', kode_item);
            formData.append('qty_hilang', qty_hilang);
            formData.append('alasan_hilang', alasan_hilang);
            formData.append('bukti_berita_acara', fileInput.files[0]);

            const response = await apiFetch<ActionResponse>('exception/writeoff', {
                method: 'POST',
                body: formData
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadWriteOffs();
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Gagal mengajukan write-off.', true);
        }
    });
}

(window as any).reportFailedDelivery = async (id: number) => {
    const result = await (window as any).Swal.fire({
        title: 'Laporkan Gagal Kirim?',
        text: "Pesanan ini akan ditandai gagal dan stok akan dikarantina.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Laporkan!',
        cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;

    try {
        const response = await apiFetch<ActionResponse>(`exception/so/${id}/failed-delivery`, {
            method: 'PATCH'
        });
        if (response.success) {
            showToast(response.message);
            loadOutboundLogistics();
        } else {
            showToast(response.message, true);
        }
    } catch (err) {
        showToast('Kesalahan jaringan.', true);
    }
};


// ============================================================
// GOODS RECEIPT (PENERIMAAN BARANG) HANDLERS
// ============================================================

let pendingPOs: any[] = [];

async function loadPendingPO(): Promise<void> {
    const tbody = document.getElementById('tbody-receipt');
    if (!tbody) return;

    try {
        const response = await apiFetch<any>('gudang/po-pending');
        if (response.success) {
            pendingPOs = response.data;
            const badge = document.getElementById('badge-receipt');
            if (badge) {
                if (pendingPOs.length > 0) {
                    badge.textContent = pendingPOs.length.toString();
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            renderReceiptTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Gagal memuat data PO.</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-rose-600">Kesalahan jaringan.</td></tr>`;
    }
}

function renderReceiptTable() {
    const tbody = document.getElementById('tbody-receipt');
    if (!tbody) return;
    tbody.innerHTML = '';

    const btnBulk = document.getElementById('btn-bulk-receipt');
    if (pendingPOs.length === 0) {
        if (btnBulk) btnBulk.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Tidak ada Purchase Order yang menunggu penerimaan.</td></tr>`;
        return;
    } else {
        if (btnBulk) btnBulk.classList.remove('hidden');
    }

    pendingPOs.forEach(po => {
        let statusBadge = '';
        if (po.status === 'APPROVED') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">APPROVED</span>`;
        } else if (po.status === 'SENT_TO_VENDOR') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200">DIKIRIM VENDOR</span>`;
        }

        const dateStr = new Date(po.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-100 transition-colors cursor-pointer";
        tr.onclick = () => (window as any).openReceiptModal(po.id, po.nomor_po);
        tr.innerHTML = `
            <td class="px-4 py-4 whitespace-nowrap"><p class="font-bold text-slate-700 font-data-mono">${po.nomor_po}</p></td>
            <td class="px-4 py-4"><p class="text-slate-600">${dateStr}</p></td>
            <td class="px-4 py-4"><p class="font-semibold text-slate-800">${po.nama_vendor}</p></td>
            <td class="px-4 py-4 text-center">${statusBadge}</td>
            <td class="px-4 py-4 text-center">
                <button class="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mx-auto" onclick="event.stopPropagation(); window.openReceiptModal(${po.id}, '${po.nomor_po}')">
                    <span class="material-symbols-outlined text-[16px]">inventory_2</span> Terima
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

(window as any).openReceiptModal = async (id: number, no_po: string) => {
    const modal = document.getElementById('modal-receipt');
    const modalContent = document.getElementById('modal-receipt-content');
    
    (document.getElementById('input-receipt-po-id') as HTMLInputElement).value = id.toString();
    (document.getElementById('input-receipt-po-no') as HTMLInputElement).value = no_po;
    (document.getElementById('input-receipt-sj') as HTMLInputElement).value = '';
    (document.getElementById('input-receipt-catatan') as HTMLTextAreaElement).value = '';
    
    const tbodyItems = document.getElementById('tbody-receipt-items');
    if (tbodyItems) tbodyItems.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-xs text-slate-500">Memuat rincian PO...</td></tr>`;

    if (modal && modalContent) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }

    try {
        const res = await apiFetch<any>(`gudang/po-pending/${id}`);
        if (res.success && tbodyItems) {
            tbodyItems.innerHTML = '';
            res.data.forEach((item: any, index: number) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="py-2 px-3 font-data-mono font-bold text-slate-700">
                        ${item.kode_barang}
                        <input type="hidden" name="items[${index}][id_inventory_material]" value="${item.id_inventory_material}">
                    </td>
                    <td class="py-2 px-3 text-slate-600">${item.nama_barang}</td>
                    <td class="py-2 px-3 text-center font-data-mono">${item.qty}</td>
                    <td class="py-2 px-3 text-center">
                        <input type="number" name="items[${index}][qty_diterima]" value="${item.qty}" min="0" max="${item.qty}" class="w-16 text-center text-xs border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400 transition-colors">
                    </td>
                    <td class="py-2 px-3 text-center">
                        <select name="items[${index}][kondisi]" class="text-xs border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-400 transition-colors cursor-pointer">
                            <option value="BAIK">BAIK</option>
                            <option value="RUSAK">RUSAK</option>
                        </select>
                    </td>
                `;
                tbodyItems.appendChild(tr);
            });
        }
    } catch (e) {
        if (tbodyItems) tbodyItems.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-xs text-rose-500">Gagal memuat rincian barang.</td></tr>`;
    }
};

function setupModalReceipt(): void {
    const modal = document.getElementById('modal-receipt');
    const modalContent = document.getElementById('modal-receipt-content');
    const btnClose = document.getElementById('btn-close-receipt');
    const btnCancel = document.getElementById('btn-cancel-receipt');
    const form = document.getElementById('form-receipt') as HTMLFormElement;

    const closeModal = () => {
        if (modal && modalContent) {
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
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
        
        const btnSubmit = document.getElementById('btn-submit-receipt') as HTMLButtonElement;
        const spinner = document.getElementById('spinner-receipt');
        
        // Parse items manually since FormData indexing can be tricky
        const fd = new FormData(form);
        const id_po_header = parseInt(fd.get('id_po_header') as string, 10);
        const surat_jalan_vendor = fd.get('surat_jalan_vendor') as string;
        const catatan = fd.get('catatan') as string;
        
        // Asumsi penerima adalah user yang login, but for simple payload, we get it from local storage
        const userStr = localStorage.getItem('motekar_user');
        const penerima = userStr ? JSON.parse(userStr).nama_lengkap : 'Staf Gudang';

        const items: any[] = [];
        let i = 0;
        while (fd.has(`items[${i}][id_inventory_material]`)) {
            items.push({
                id_inventory_material: parseInt(fd.get(`items[${i}][id_inventory_material]`) as string, 10),
                qty_diterima: parseInt(fd.get(`items[${i}][qty_diterima]`) as string, 10),
                kondisi: fd.get(`items[${i}][kondisi]`) as string
            });
            // Hapus key lama agar tidak pusing di backend
            fd.delete(`items[${i}][id_inventory_material]`);
            fd.delete(`items[${i}][qty_diterima]`);
            fd.delete(`items[${i}][kondisi]`);
            i++;
        }
        
        // Append parsed items as a JSON string
        fd.append('items', JSON.stringify(items));
        fd.append('penerima', penerima);

        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.classList.add('opacity-80', 'cursor-wait'); }
        if (spinner) { spinner.classList.remove('hidden'); spinner.classList.add('animate-spin'); }

        try {
            const response = await apiFetch<ActionResponse>('gudang/receive', {
                method: 'POST',
                body: fd
            });

            if (response.success) {
                showToast(response.message);
                closeModal();
                loadPendingPO(); // Refresh receipt list
            } else {
                showToast(response.message, true);
            }
        } catch (apiErr) {
            showToast('Terjadi kesalahan koneksi API saat memproses penerimaan.', true);
        } finally {
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-80', 'cursor-wait'); }
            if (spinner) { spinner.classList.add('hidden'); spinner.classList.remove('animate-spin'); }
        }
    });
}

// ============================================================
// INIT
// ============================================================


document.addEventListener('DOMContentLoaded', () => {
  const user = initRBAC('nav-gudang');
  if (!user) return;

  loadGudang();
  setupFilters();
  setupModalInbound();
  setupModalOpname();
  setupModalDispatch();
  setupExceptionForms();
  setupModalReceipt();

  // Polling for Real-Time Experience (Every 30 seconds)
  setInterval(() => {
      const tab = localStorage.getItem('gudangLastTab') || 'master';
      if (tab === 'master') loadGudang();
      else if (tab === 'outbound') loadOutboundLogistics();
      else if (tab === 'exception') loadWriteOffs();
      else if (tab === 'receipt') loadPendingPO();
  }, 30000);
});

(window as any).approveWriteoff = async (id: number) => {
            if (confirm('Approve write-off ini?')) {
                const res = await apiFetch<any>(`exception/writeoff/${id}/approve`, { method: 'PATCH' });
                showToast(res.message, !res.success);
                if (res.success) loadWriteOffs();
            }
        };
(window as any).rejectWriteoff = async (id: number) => {
            if (confirm('Reject write-off ini?')) {
                const res = await apiFetch<any>(`exception/writeoff/${id}/reject`, { method: 'PATCH' });
                showToast(res.message, !res.success);
                if (res.success) loadWriteOffs();
            }
        };
