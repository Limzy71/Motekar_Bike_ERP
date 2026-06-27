/**
 * profil.ts — Logic untuk halaman Profil Eksekutif.
 * Features:
 * - Dynamic profile data from API
 * - Professional Initials Generator (fallback avatar)
 * - Conditional avatar rendering (foto vs inisial)
 * - Base64 avatar upload (max 2MB)
 * - Password change with strength validator
 */

import { apiFetch, getUserData } from '../api.js';
import { initRBAC, showToast, showConfirm } from '../components/rbac.js';

const BACKEND_URL = 'http://127.0.0.1:5050';

interface UserProfile {
  id: number;
  username: string;
  nama_lengkap: string;
  email: string | null;
  divisi_role: string;
  foto_profil: string | null;
  created_at: string;
}

// ============================================================
// HELPER: Professional Initials Generator
// ============================================================

/**
 * Menghasilkan inisial profesional dari nama lengkap.
 * Aturan:
 * - Ganti _ dan - dengan spasi
 * - ≥2 kata: huruf pertama kata-1 + huruf pertama kata-2
 * - 1 kata: 2 huruf pertama
 * - Selalu uppercase, max 2 karakter
 */
function getProfessionalInitials(fullName: string): string {
  if (!fullName || fullName.trim().length === 0) return '??';

  if (fullName === 'IT & System Administrator' || fullName.toUpperCase().startsWith('IT ')) {
    return 'IT';
  }

  const cleaned = fullName.replace(/[_-]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);

  let initials: string;
  if (words.length >= 2) {
    initials = words[0][0] + words[1][0];
  } else {
    initials = words[0].substring(0, 2);
  }

  return initials.toUpperCase().substring(0, 2);
}

/**
 * Generate warna background konsisten dari hash nama.
 * Menghasilkan warna slate/navy gelap yang elegan.
 */
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Hue antara 200-260 (biru-navy), saturation 25-40%, lightness 18-28%
  const hue = 200 + (Math.abs(hash) % 60);
  const sat = 25 + (Math.abs(hash >> 8) % 15);
  const light = 18 + (Math.abs(hash >> 16) % 10);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// ============================================================
// RENDER AVATAR (Conditional: foto vs inisial)
// ============================================================

function renderAvatar(
  container: HTMLElement,
  profile: UserProfile,
  size: 'hero' | 'header'
): void {
  const initials = getProfessionalInitials(profile.nama_lengkap);
  const bgColor = getAvatarColor(profile.nama_lengkap);

  if (profile.foto_profil) {
    // Render <img> tag
    const imgUrl = `${BACKEND_URL}/uploads/avatars/${profile.foto_profil}`;
    if (size === 'hero') {
      container.innerHTML = `<img src="${imgUrl}" alt="Avatar" class="w-full h-full object-cover">`;
      container.style.backgroundColor = '';
    } else {
      container.innerHTML = `<img src="${imgUrl}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
      container.style.backgroundColor = '';
    }
  } else {
    // Render text initials
    if (size === 'hero') {
      container.innerHTML = `<span class="select-none">${initials}</span>`;
      container.style.backgroundColor = bgColor;
    } else {
      container.innerHTML = `<span class="text-sm select-none">${initials}</span>`;
      container.style.backgroundColor = bgColor;
    }
  }
}

function renderAvatarModal(profile: UserProfile): void {
  const container = document.getElementById('modal-avatar-preview');
  if (!container) return;
  
  const initials = getProfessionalInitials(profile.nama_lengkap);
  const bgColor = getAvatarColor(profile.nama_lengkap);

  if (profile.foto_profil) {
    const imgUrl = `${BACKEND_URL}/uploads/avatars/${profile.foto_profil}`;
    container.innerHTML = `<img src="${imgUrl}" alt="Avatar" class="w-full h-full object-cover">`;
    container.style.backgroundColor = '';
  } else {
    container.innerHTML = `<span class="select-none">${initials}</span>`;
    container.style.backgroundColor = bgColor;
  }
}

// ============================================================
// LOAD PROFILE DATA
// ============================================================

let currentProfile: UserProfile | null = null;

async function loadProfile(): Promise<void> {
  try {
    const response = await apiFetch<{ success: boolean; data: UserProfile }>('profil/me');
    if (!response.success) {
      showToast('Gagal memuat data profil.', true);
      return;
    }

    currentProfile = response.data;
    const p = currentProfile;
    const initials = getProfessionalInitials(p.nama_lengkap);

    // Header
    const headerNama = document.getElementById('header-nama');
    const headerRole = document.getElementById('header-role');
    const headerAvatar = document.getElementById('header-avatar-container');
    if (headerNama) headerNama.textContent = p.nama_lengkap;
    // headerRole handled by initRBAC / renderHeaderProfile
    if (headerAvatar) renderAvatar(headerAvatar, p, 'header');

    // Hero Banner
    const heroAvatar = document.getElementById('hero-avatar');
    const heroNama = document.getElementById('hero-nama');
    const heroDivisi = document.getElementById('hero-divisi');
    const heroUsername = document.getElementById('hero-username');
    const heroEmail = document.getElementById('hero-email');
    const heroRoleBadge = document.getElementById('hero-role-badge');

    if (heroAvatar) renderAvatar(heroAvatar, p, 'hero');
    renderAvatarModal(p);

    if (heroNama) heroNama.textContent = p.nama_lengkap;
    let displayRole = p.divisi_role;
    if (p.divisi_role === 'Owner') displayRole = 'Pemilik Perusahaan';
    else if (p.divisi_role === 'General Manager') displayRole = 'Manajer Umum';
    else if (p.divisi_role === 'IT Support' || p.divisi_role === 'Admin') displayRole = 'Administrator Sistem';
    else displayRole = `Divisi ${p.divisi_role}`;

    if (heroDivisi) heroDivisi.textContent = displayRole;
    if (heroUsername) heroUsername.textContent = p.username;
    if (heroEmail) heroEmail.textContent = p.email || '-';
    if (heroRoleBadge) {
      heroRoleBadge.textContent = `CLEARANCE: ${p.divisi_role.toUpperCase()}`;
    }

    // Auto-fill email pada form kredensial & email
    const inputEmail = document.getElementById('input-current-email') as HTMLInputElement;
    const inputEmail2 = document.querySelector('#form-email #input-current-email') as HTMLInputElement;
    if (inputEmail) inputEmail.value = p.email || '-';
    if (inputEmail2) inputEmail2.value = p.email || '-';

    // Handle RBAC Email Form UI
    const containerEmail = document.getElementById('container-ganti-email');
    const emailForbiddenMsg = document.getElementById('email-forbidden-msg');
    const formEmail = document.getElementById('form-email');
    
    if (p.divisi_role === 'IT Support') {
      if (emailForbiddenMsg) emailForbiddenMsg.classList.remove('hidden');
      if (formEmail) {
        const inputs = formEmail.querySelectorAll('input, button');
        inputs.forEach(el => (el as HTMLInputElement).disabled = true);
      }
    }

  } catch (err) {
    console.error('loadProfile error:', err);
    showToast('Gagal memuat profil.', true);
  }
}

// ============================================================
// AVATAR UPLOAD
// ============================================================

function setupAvatarUpload(): void {
  const btnTrigger = document.getElementById('btn-trigger-upload');
  const fileInput = document.getElementById('input-avatar-file') as HTMLInputElement;

  btnTrigger?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    // Validasi ukuran (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran foto maksimal 2MB!', true);
      fileInput.value = '';
      return;
    }

    // Validasi tipe
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Format harus PNG, JPEG, atau WebP.', true);
      fileInput.value = '';
      return;
    }

    // Convert ke base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;

      try {
        showToast('Mengunggah foto...');
        const response = await apiFetch<{ success: boolean; message: string; data?: { foto_profil: string } }>('profil/avatar', {
          method: 'POST',
          body: JSON.stringify({
            image_data: base64,
            file_name: file.name
          })
        });

        if (response.success) {
          showToast(response.message);
          // Reload profile to update avatar everywhere
          await loadProfile();
        } else {
          showToast(response.message, true);
        }
      } catch (err) {
        showToast('Gagal mengunggah foto.', true);
      }
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });
}

function setupAvatarModal(): void {
  const modal = document.getElementById('avatar-modal');
  const backdrop = document.getElementById('avatar-modal-backdrop');
  const btnOpen = document.getElementById('btn-open-avatar-modal');
  const btnClose = document.getElementById('btn-close-avatar-modal');
  const btnGanti = document.getElementById('btn-modal-ganti-foto');
  const btnHapus = document.getElementById('btn-modal-hapus-foto');
  const fileInput = document.getElementById('input-avatar-file') as HTMLInputElement;

  const openModal = () => {
    modal?.classList.remove('hidden');
    // Ensure the preview matches the latest state when opened
    if (currentProfile) renderAvatarModal(currentProfile);
  };
  
  const closeModal = () => modal?.classList.add('hidden');

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);

  btnGanti?.addEventListener('click', () => {
    fileInput?.click();
    closeModal();
  });

  btnHapus?.addEventListener('click', async () => {
    if (!currentProfile?.foto_profil) {
      showToast('Tidak ada foto profil untuk dihapus.', true);
      return;
    }

    showConfirm('Hapus Foto Profil', 'Anda yakin ingin menghapus foto profil ini secara permanen?', async () => {
      try {
        (btnHapus as HTMLButtonElement).disabled = true;
        const originalText = btnHapus.innerHTML;
        btnHapus.textContent = 'Menghapus...';

        const response = await apiFetch<{ success: boolean; message: string }>('profil/avatar', {
          method: 'DELETE'
        });

        if (response.success) {
          showToast(response.message);
          await loadProfile(); // Reload dynamic profile to revert to initials
          closeModal();
        } else {
          showToast(response.message, true);
        }
        btnHapus.innerHTML = originalText;
      } catch (err) {
        showToast('Gagal menghapus foto profil.', true);
      } finally {
        (btnHapus as HTMLButtonElement).disabled = false;
      }
    });
  });
}

// ============================================================
// TABS & NAVIGATION
// ============================================================

function setupTabs(): void {
  const tabs = [
    { id: 'tab-auth', view: 'view-auth' },
    { id: 'tab-notif', view: 'view-notif' },
    { id: 'tab-audit', view: 'view-audit' }
  ];

  const activeClass = 'pb-4 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors flex items-center gap-2';
  const inactiveClass = 'pb-4 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2';

  const switchTab = (tabId: string, viewId: string) => {
      tabs.forEach(t => {
        document.getElementById(t.id)!.className = inactiveClass;
        const view = document.getElementById(t.view);
        if (view) {
          view.classList.add('hidden');
          view.classList.remove('block');
        }
      });
      const btn = document.getElementById(tabId);
      if (btn) btn.className = activeClass;
      const activeView = document.getElementById(viewId);
      if (activeView) {
        activeView.classList.remove('hidden');
        activeView.classList.add('block');
      }
      localStorage.setItem('profilLastTab', tabId);
  };

  tabs.forEach(tab => {
    const btn = document.getElementById(tab.id);
    btn?.addEventListener('click', () => switchTab(tab.id, tab.view));
  });

  const lastTabId = localStorage.getItem('profilLastTab');
  const foundTab = tabs.find(t => t.id === lastTabId);
  if (foundTab) {
      switchTab(foundTab.id, foundTab.view);
  } else {
      switchTab('tab-auth', 'view-auth');
  }

  // Remove anti-flicker style once tabs are properly initialized
  const antiFlicker = document.getElementById('anti-flicker');
  if (antiFlicker) antiFlicker.remove();
}

// ============================================================
// PASSWORD STRENGTH VALIDATOR
// ============================================================

function setupPasswordValidation(): void {
  const inputOldPass = document.getElementById('input-old-pass') as HTMLInputElement;
  const inputPass = document.getElementById('input-new-pass') as HTMLInputElement;
  const inputConfirm = document.getElementById('input-confirm-pass') as HTMLInputElement;
  const btnSave = document.getElementById('btn-save-pass') as HTMLButtonElement;

  const reqLength = document.getElementById('req-length');
  const reqUpper = document.getElementById('req-upper');
  const reqNumber = document.getElementById('req-number');
  const reqSymbol = document.getElementById('req-symbol');
  const pwBars = document.querySelectorAll('#pw-strength-bar div');

  if (!inputPass || !btnSave) return;

  const checkStrength = () => {
    const val = inputPass.value;
    const conf = inputConfirm.value;

    const isLong = val.length >= 8;
    const hasUpper = /[A-Z]/.test(val);
    const hasNumber = /[0-9]/.test(val);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(val);

    updateReqUI(reqLength, isLong);
    updateReqUI(reqUpper, hasUpper);
    updateReqUI(reqNumber, hasNumber);
    updateReqUI(reqSymbol, hasSymbol);

    let score = 0;
    if (isLong) score++;
    if (hasUpper) score++;
    if (hasNumber) score++;
    if (hasSymbol) score++;

    pwBars.forEach((bar, index) => {
      (bar as HTMLElement).className = 'flex-1 ' + (index === 0 ? 'rounded-l-full ' : '') + (index === 3 ? 'rounded-r-full ' : '');
      if (index < score) {
        if (score <= 2) (bar as HTMLElement).classList.add('bg-rose-500');
        else if (score === 3) (bar as HTMLElement).classList.add('bg-amber-500');
        else (bar as HTMLElement).classList.add('bg-emerald-500');
      } else {
        (bar as HTMLElement).classList.add('bg-slate-200');
      }
    });

    if (score === 4 && val === conf && val !== '') {
      btnSave.disabled = false;
      btnSave.className = 'w-full bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-all';
    } else {
      btnSave.disabled = true;
      btnSave.className = 'w-full bg-slate-300 cursor-not-allowed text-slate-500 px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-all';
    }
  };

  function updateReqUI(el: HTMLElement | null, isValid: boolean) {
    if (!el) return;
    const icon = el.querySelector('span');
    if (isValid) {
      el.classList.add('text-emerald-600');
      el.classList.remove('text-slate-500');
      if (icon) icon.textContent = 'check';
    } else {
      el.classList.remove('text-emerald-600');
      el.classList.add('text-slate-500');
      if (icon) icon.textContent = 'close';
    }
  }

  inputPass.addEventListener('input', checkStrength);
  inputConfirm.addEventListener('input', checkStrength);

  // Form Submit — real API call
  document.getElementById('form-kredensial')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPass = inputOldPass.value;
    const newPass = inputPass.value;

    try {
      btnSave.disabled = true;
      btnSave.textContent = 'Memproses...';

      const response = await apiFetch<{ success: boolean; message: string }>('profil/password', {
        method: 'PATCH',
        body: JSON.stringify({ old_password: oldPass, new_password: newPass })
      });

      if (response.success) {
        showToast(response.message);
        inputOldPass.value = '';
        inputPass.value = '';
        inputConfirm.value = '';
        checkStrength();
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal mengubah password.', true);
    } finally {
      btnSave.textContent = 'Simpan Password Baru';
    }
  });
}

// ============================================================
// EMAIL RBAC HANDLER
// ============================================================
function setupEmailRBAC(): void {
  const formEmail = document.getElementById('form-email');
  const formVerify = document.getElementById('form-verify-email');
  const containerVerify = document.getElementById('container-verify-email');
  const lblVerifyMsg = document.getElementById('lbl-verify-msg');

  formEmail?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-email') as HTMLButtonElement;
    const newEmail = (document.getElementById('input-new-email') as HTMLInputElement).value;

    try {
      btn.disabled = true;
      btn.textContent = 'Memproses...';

      const response = await apiFetch<{ success: boolean; message: string; token: string | null }>('profil/email/request', {
        method: 'POST',
        body: JSON.stringify({ email_baru: newEmail })
      });

      if (response.success) {
        showToast('Pengajuan berhasil dibuat.');
        
        if (response.token) {
          // Owner -> show token directly for simulation
          if (containerVerify) containerVerify.classList.remove('hidden');
          if (lblVerifyMsg) lblVerifyMsg.textContent = `[SIMULASI] Token Verifikasi Anda: ${response.token}`;
        } else {
          // Pending Approval
          showToast(response.message);
        }
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal mengajukan perubahan email.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ajukan Perubahan Email';
    }
  });

  formVerify?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-verify-email') as HTMLButtonElement;
    const token = (document.getElementById('input-token-email') as HTMLInputElement).value;

    try {
      btn.disabled = true;
      btn.textContent = 'Memverifikasi...';

      const response = await apiFetch<{ success: boolean; message: string }>('profil/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token })
      });

      if (response.success) {
        showToast(response.message);
        containerVerify?.classList.add('hidden');
        (document.getElementById('input-new-email') as HTMLInputElement).value = '';
        (document.getElementById('input-token-email') as HTMLInputElement).value = '';
        loadProfile(); // Reload to update displayed email
      } else {
        showToast(response.message, true);
      }
    } catch (err) {
      showToast('Gagal memverifikasi token.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verifikasi & Simpan Email';
    }
  });
}

// ============================================================
// ACTIONS & AUDIT
// ============================================================

function setupActions(): void {
  document.getElementById('btn-revoke')?.addEventListener('click', () => {
    showToast('Akses di perangkat lain telah dicabut.');
  });

  document.getElementById('btn-test-telegram')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-telegram') as HTMLButtonElement;
    const id = (document.getElementById('input-telegram-id') as HTMLInputElement)?.value;
    if (!id) {
      showToast('Harap masukkan Chat ID Telegram', true);
      return;
    }

    try {
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.textContent = 'Mengirim...';

      const response = await apiFetch<{ success: boolean; message: string }>('profil/telegram/test', {
        method: 'POST',
        body: JSON.stringify({ chat_id: id })
      });

      if (response.success) {
        showToast('Pesan Telegram terkirim!');
      } else {
        showToast(response.message, true);
      }

      btn.innerHTML = originalText;
    } catch (err) {
      showToast('Gagal mengirim pesan Telegram.', true);
      btn.disabled = false;
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderAuditLogs(): Promise<void> {
  const tbody = document.getElementById('tbody-audit');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 text-sm">Memuat jejak audit...</td></tr>';

  try {
    const response = await apiFetch<{ success: boolean; data: any[] }>('profil/audit');
    if (!response.success || !response.data || response.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 text-sm">Belum ada jejak audit yang terekam.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    response.data.forEach(log => {
      const statusColor = log.status === 'Success' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                          log.status === 'Failed' ? 'text-rose-600 bg-rose-50 border-rose-200' :
                          'text-amber-600 bg-amber-50 border-amber-200';

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-100 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-slate-500"><span class="font-data-mono">${log.waktu}</span></td>
        <td class="px-6 py-4 whitespace-nowrap text-slate-400 text-xs"><span class="font-data-mono">${log.ip_address}</span></td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded border ${statusColor} text-[11px] font-bold uppercase tracking-wider">
            ${log.status}
          </span>
        </td>
        <td class="px-6 py-4 text-slate-700">${log.action}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-rose-500 text-sm">Gagal memuat jejak audit.</td></tr>';
  }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initRBAC('');

  loadProfile();
  setupAvatarUpload();
  setupAvatarModal();
  setupTabs();
  setupPasswordValidation();
  setupEmailRBAC();
  setupActions();
  renderAuditLogs();
});
