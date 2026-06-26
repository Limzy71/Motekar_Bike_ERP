import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

// Type Definitions
interface User {
  id: number;
  username: string;
  nama_lengkap: string;
  email: string | null;
  divisi_role: string;
  status: string;
  created_at: string;
}

// State
let allUsers: User[] = [];
let currentUserRole = '';
let currentPage = 1;
const itemsPerPage = 10;

// DOM Elements
const tbody = document.getElementById('table-users') as HTMLTableSectionElement;
const modal = document.getElementById('modal-user') as HTMLDivElement;
const form = document.getElementById('form-user') as HTMLFormElement;
const modalTitle = document.getElementById('modal-title') as HTMLHeadingElement;
const btnTambah = document.getElementById('btn-tambah-user') as HTMLButtonElement;
const btnClose = document.getElementById('btn-close-modal') as HTMLButtonElement;
const btnCancel = document.getElementById('btn-cancel-modal') as HTMLButtonElement;
const containerStatus = document.getElementById('container-status') as HTMLDivElement;

const inputId = document.getElementById('input-id') as HTMLInputElement;
const inputUsername = document.getElementById('input-username') as HTMLInputElement;
const inputNama = document.getElementById('input-nama') as HTMLInputElement;
const inputEmail = document.getElementById('input-email') as HTMLInputElement;
const selectRole = document.getElementById('select-role') as HTMLSelectElement;
const selectStatus = document.getElementById('select-status') as HTMLSelectElement;

// ============================================================
// DATA FETCHING & RENDERING
// ============================================================

async function loadUsers() {
  try {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">Memuat data...</td></tr>';
    
    const response = await apiFetch<{ success: boolean; data: User[] }>('users');
    if (response.success && response.data) {
      allUsers = response.data;
      renderTable();
    } else {
      showToast('Gagal memuat data pengguna', true);
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi', true);
  }
}

function renderTable() {
  tbody.innerHTML = '';
  
  if (allUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">Belum ada data pengguna.</td></tr>';
    return;
  }

  // Custom sort order based on user request
  const roleOrder = [
    'Owner',
    'General Manager',
    'Pengadaan',
    'Kendali Mutu',
    'Penjualan & Penagihan',
    'Keuangan',
    'Pemasaran',
    'Operasi Inti',
    'Gudang',
    'IT Support'
  ];

  const sortedUsers = [...allUsers].sort((a, b) => {
    const indexA = roleOrder.indexOf(a.divisi_role);
    const indexB = roleOrder.indexOf(b.divisi_role);
    
    // If both roles are not in the list, sort by ID
    if (indexA === -1 && indexB === -1) return a.id - b.id;
    // If one is not in the list, push it to the bottom
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });

  const totalItems = sortedUsers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = sortedUsers.slice(startIndex, endIndex);

  currentItems.forEach((user, index) => {
    const displayId = startIndex + index + 1;
    const isOwner = user.divisi_role === 'Owner';
    const isGM = user.divisi_role === 'General Manager';
    
    let isRestricted = false;
    if (isOwner && (currentUserRole === 'IT Support' || currentUserRole === 'General Manager')) {
      isRestricted = true;
    }
    if (isGM && currentUserRole === 'IT Support') {
      isRestricted = true;
    }

    let actionBtns = '';

    // If IT Support or GM is viewing a restricted role, disable actions
    if (isRestricted) {
      actionBtns = `<div class="flex items-center justify-center"><span class="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded">RESTRICTED</span></div>`;
    } else {
      actionBtns = `
        <div class="flex items-center justify-center gap-2">
          <button class="btn-edit text-slate-400 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-colors" title="Edit Pengguna" data-id="${user.id}">
            <span class="material-symbols-outlined text-[18px] pointer-events-none">edit</span>
          </button>
          <button class="btn-reset text-slate-400 hover:text-amber-600 p-1.5 rounded-md hover:bg-amber-50 transition-colors" title="Reset Password" data-id="${user.id}">
            <span class="material-symbols-outlined text-[18px] pointer-events-none">key</span>
          </button>
        </div>
      `;
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="px-6 py-4 font-data-mono text-slate-500">#${displayId}</td>
      <td class="px-6 py-4">
        <div class="font-bold text-slate-900">${user.username}</div>
        <div class="text-[11px] text-slate-500">${user.nama_lengkap}</div>
      </td>
      <td class="px-6 py-4">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getRoleColor(user.divisi_role)}">${user.divisi_role}</span>
      </td>
      <td class="px-6 py-4">
        <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${user.status === 'Aktif' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">${user.status}</span>
      </td>
      <td class="px-6 py-4">
        ${actionBtns}
      </td>
    `;
    tbody.appendChild(tr);
  });

  updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updatePaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('users-pagination-info');
    const btnPrev = document.getElementById('users-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('users-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('users-pagination-pages');

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

function getRoleColor(role: string): string {
  if (role === 'Owner') return 'bg-amber-100 text-amber-800';
  if (role === 'General Manager') return 'bg-purple-100 text-purple-800';
  if (role === 'IT Support') return 'bg-indigo-100 text-indigo-800';
  return 'bg-blue-50 text-blue-700';
}

// ============================================================
// MODAL & FORM HANDLING
// ============================================================

function openModal(mode: 'add' | 'edit', userId?: number) {
  modal.classList.remove('hidden');
  
  if (mode === 'add') {
    modalTitle.textContent = 'Tambah Pengguna Baru';
    form.reset();
    inputId.value = '';
    inputUsername.disabled = false;
    inputNama.disabled = false;
    containerStatus.classList.add('hidden');
  } else if (mode === 'edit' && userId) {
    modalTitle.textContent = 'Edit Pengguna';
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    inputId.value = user.id.toString();
    inputUsername.value = user.username;
    inputUsername.disabled = true; // Can't edit username
    
    inputNama.value = user.nama_lengkap;
    inputEmail.value = user.email || '';
    selectRole.value = user.divisi_role;
    selectStatus.value = user.status;
    
    containerStatus.classList.remove('hidden');
  }
}

function closeModal() {
  modal.classList.add('hidden');
  form.reset();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = inputId.value;
  const isEdit = !!id;

  const payload: any = {
    nama_lengkap: inputNama.value,
    email: inputEmail.value,
    divisi_role: selectRole.value,
  };

  if (!isEdit) {
    payload.username = inputUsername.value;
  } else {
    payload.status = selectStatus.value;
  }

  const endpoint = isEdit ? `users/${id}` : 'users';
  const method = isEdit ? 'PATCH' : 'POST';

  try {
    const response = await apiFetch<{ success: boolean; message: string }>(endpoint, {
      method,
      body: JSON.stringify(payload)
    });

    if (response.success) {
      // @ts-ignore
      Swal.fire({
          title: 'Berhasil!',
          text: response.message,
          icon: 'success',
          timer: 2500,
          showConfirmButton: false
      });
      closeModal();
      loadUsers();
    } else {
      // @ts-ignore
      Swal.fire('Gagal!', response.message, 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan sistem', true);
  }
});

btnTambah.addEventListener('click', () => openModal('add'));
btnClose.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);

// ============================================================
// ACTION BUTTONS (DELEGATION)
// ============================================================

tbody.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const btnEdit = target.closest('.btn-edit') as HTMLButtonElement;
  const btnReset = target.closest('.btn-reset') as HTMLButtonElement;

  if (btnEdit) {
    const id = parseInt(btnEdit.dataset.id || '0');
    openModal('edit', id);
  }

  if (btnReset) {
    const id = parseInt(btnReset.dataset.id || '0');
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    // @ts-ignore
    const result = await Swal.fire({
      title: 'Reset Password?',
      text: `Password untuk ${user.username} akan di-reset menjadi "motekar123". Anda yakin?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Ya, Reset',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      try {
        const response = await apiFetch<{ success: boolean; message: string }>(`users/${id}/reset-password`, {
          method: 'PATCH'
        });

        if (response.success) {
          // @ts-ignore
          Swal.fire('Berhasil!', response.message, 'success');
        } else {
          // @ts-ignore
          Swal.fire('Gagal!', response.message, 'error');
        }
      } catch (error) {
        showToast('Terjadi kesalahan sistem', true);
      }
    }
  }
});

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = initRBAC('nav-users');
  if (!user) return; 

  currentUserRole = user.divisi_role;
  loadUsers();
});
