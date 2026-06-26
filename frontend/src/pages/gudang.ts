/**
 * gudang.ts — Logic untuk halaman Gudang & Inventori.
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface InventoryItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  jumlah_stok: number;
  satuan: string;
  reorder_point: number;
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
    // 1. Kategori Filter
    const matchCategory = currentFilter === 'Semua' || item.kategori === currentFilter;
    
    // 2. Search Filter (kode atau nama)
    const searchTerm = currentSearch.toLowerCase();
    const matchSearch = currentSearch === '' || 
                        item.kode_barang.toLowerCase().includes(searchTerm) || 
                        item.nama_barang.toLowerCase().includes(searchTerm);
    
    return matchCategory && matchSearch;
  });

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada data stok yang sesuai.</td></tr>`;
    updatePaginationUI();
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
    const rop = item.reorder_point || 10; // Fallback ke 10 jika ROP belum di-set
    if (item.jumlah_stok <= rop) {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-rose-50 text-rose-700 border-rose-200/80">Kritis</span>`;
    } else {
      statusBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200/80">Aman</span>`;
    }

    let lokasi = "Gudang Utama";
    if (item.kategori === 'WIP') {
        lokasi = "Shop Floor / Area Produksi";
    } else if (item.kategori === 'FG' || item.kategori === 'Sepeda Jadi' || item.kategori === 'Barang Jadi') {
        lokasi = "Gudang Barang Jadi";
    }
    const lokasiBadge = `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full whitespace-nowrap"><span class="material-symbols-outlined text-[14px]">location_on</span> ${lokasi}</span>`;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 border-b border-slate-100 text-xs font-medium text-slate-600 last:border-b-0 group';
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

  updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updatePaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('gudang-pagination-info');
    const btnPrev = document.getElementById('gudang-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('gudang-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('gudang-pagination-pages');

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
                renderTable();
            }
        };
    }

    if (btnNext) {
        btnNext.disabled = currentPage >= totalPages;
        btnNext.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
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
                    renderTable();
                };
                pagesContainer.appendChild(btn);
            }
        }
    }
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
  const sectionMaster = document.getElementById('section-master');
  const sectionOutbound = document.getElementById('section-outbound');

  tabMaster?.addEventListener('click', () => {
      tabMaster.className = "px-6 py-3 border-b-2 border-primary text-primary font-bold text-sm transition-colors";
      tabOutbound!.className = "px-6 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors flex items-center gap-2";
      sectionMaster?.classList.remove('hidden');
      sectionOutbound?.classList.add('hidden');
  });

  tabOutbound?.addEventListener('click', () => {
      tabOutbound.className = "px-6 py-3 border-b-2 border-primary text-primary font-bold text-sm transition-colors flex items-center gap-2";
      tabMaster!.className = "px-6 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors";
      sectionOutbound?.classList.remove('hidden');
      sectionMaster?.classList.add('hidden');
      loadOutboundLogistics();
  });
}

// ============================================================
// OUTBOUND LOGISTICS HANDLERS
// ============================================================

async function loadOutboundLogistics(): Promise<void> {
  const tbody = document.getElementById('tbody-outbound');
  if (!tbody) return;

  try {
      const response = await apiFetch<{success: boolean, data: OutboundSO[]}>('penjualan/so');
      if (response.success) {
          // Filter ONLY RESERVED
          outboundSOs = response.data.filter(so => so.status_so === 'RESERVED');
          
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

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition-colors";
        tr.innerHTML = `
            <td class="px-4 py-4 whitespace-nowrap"><p class="font-bold text-blue-700">${so.nomor_so}</p></td>
            <td class="px-4 py-4"><p class="font-semibold text-slate-800">${so.nama_customer}</p></td>
            <td class="px-4 py-4"><p class="text-slate-600 truncate max-w-[200px]" title="${so.alamat_pengiriman}">${so.alamat_pengiriman}</p></td>
            <td class="px-4 py-4 text-right"><p class="font-data-mono font-bold">${totalItems}</p></td>
            <td class="px-4 py-4 text-center">
                <button onclick="window.openDispatchModal(${so.id}, '${so.nomor_so}')" class="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mx-auto">
                    <span class="material-symbols-outlined text-[16px]">local_shipping</span> Dispatch
                </button>
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
                    const response = await apiFetch<ActionResponse>(`penjualan/so/${id}/ship`, {
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
});
