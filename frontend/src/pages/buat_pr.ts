/**
 * buat_pr.ts — Logic untuk halaman form Buat PR Baru.
 * Migrasi dari: Motekar_ERP/frontend/buat_pr.html (inline script)
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface PRResponse {
  success: boolean;
  message: string;
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inisialisasi proteksi login dan header profile
  const user = initRBAC('nav-pengadaan');
  if (!user) return; // Belum login

  // 2. Kunci Format Penomoran: Pertahankan logika asli persis dari simpan_pr.php (frontend generator)
  const inputNomorPr = document.getElementById('input-nomor-pr') as HTMLInputElement;
  if (inputNomorPr) {
    const tahun = new Date().getFullYear();
    const randomID = Math.floor(1000 + Math.random() * 9000);
    inputNomorPr.value = `PR/MTK/${tahun}/${randomID}`;
  }

  // 3. Handle submit form
  const form = document.getElementById('form-buat-pr') as HTMLFormElement;
  const btnSubmit = document.getElementById('btn-submit') as HTMLButtonElement;
  const btnSubmitIcon = document.getElementById('btn-submit-icon');
  const btnSubmitText = document.getElementById('btn-submit-text');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Ambil semua data dari form
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      // UX: Tombol loading state
      const originalIcon = btnSubmitIcon?.innerText || 'save';
      const originalText = btnSubmitText?.innerText || 'Simpan & Ajukan';
      
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-80', 'cursor-wait');
      }
      if (btnSubmitIcon) {
        btnSubmitIcon.innerText = 'sync';
        btnSubmitIcon.classList.add('animate-spin');
      }
      if (btnSubmitText) {
        btnSubmitText.innerText = 'Menyimpan...';
      }

      try {
        const response = await apiFetch<PRResponse>('pengadaan', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        if (response.success) {
          showToast('PR Berhasil Dibuat! Mengalihkan...');
          
          if (btnSubmitIcon) {
            btnSubmitIcon.classList.remove('animate-spin');
            btnSubmitIcon.innerText = 'check_circle';
          }
          if (btnSubmitText) {
            btnSubmitText.innerText = 'Berhasil!';
          }

          setTimeout(() => {
            window.location.href = 'pengadaan.html';
          }, 2000);
        } else {
          showToast(response.message || 'Gagal membuat PR', true);
          restoreSubmitButton();
        }
      } catch (err: any) {
        console.error('Submit PR Error:', err);
        showToast('Terjadi kesalahan jaringan.', true);
        restoreSubmitButton();
      }

      // Helper function to restore button state on failure
      function restoreSubmitButton() {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.classList.remove('opacity-80', 'cursor-wait');
        }
        if (btnSubmitIcon) {
          btnSubmitIcon.classList.remove('animate-spin');
          btnSubmitIcon.innerText = originalIcon;
        }
        if (btnSubmitText) {
          btnSubmitText.innerText = originalText;
        }
      }
    });
  }
});
