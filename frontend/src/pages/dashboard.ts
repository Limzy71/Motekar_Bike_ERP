/**
 * dashboard.ts — Logic untuk halaman Dashboard Utama.
 * Migrasi dari: Motekar_ERP/frontend/script.js → loadDashboard()
 *
 * Fitur:
 * 1. Login guard + RBAC sidebar/header
 * 2. Fetch data dashboard dari API (/api/dashboard)
 * 3. Render 4 KPI cards
 * 4. Render 2 Chart.js charts (Bar + Doughnut)
 * 5. Tombol "Segarkan Data" untuk refresh
 */

import { Chart, BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

// Register Chart.js components yang diperlukan (tree-shaking friendly)
Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);

// ============================================================
// CHART INSTANCES (agar bisa di-destroy saat refresh)
// ============================================================

let kanbanChartInstance: Chart | null = null;
let stokChartInstance: Chart | null = null;

// ============================================================
// DASHBOARD DATA TYPES
// ============================================================

interface DashboardKPI {
  total_pr: number;
  total_invoice: number;
  job_selesai: number;
  stok_komponen: number;
}

interface ChartItem {
  label: string;
  data: number;
}

interface DashboardCharts {
  kanban_status: ChartItem[];
  stok_kategori: ChartItem[];
}

interface DashboardResponse {
  success: boolean;
  data: {
    kpi: DashboardKPI;
    charts: DashboardCharts;
  };
  message?: string;
}

// ============================================================
// LOAD DASHBOARD DATA
// ============================================================

/**
 * Fetch data dashboard dari backend dan render KPI + Charts.
 */
async function loadDashboard(role: string): Promise<void> {
  try {
    const isExecutive = ['Owner', 'General Manager'].includes(role);
    const execContainer = document.getElementById('kpi-executive-container');
    const opsContainer = document.getElementById('kpi-operational-container');

    if (isExecutive) {
      execContainer?.classList.remove('hidden');
      opsContainer?.classList.add('hidden');
    } else {
      execContainer?.classList.add('hidden');
      opsContainer?.classList.remove('hidden');
    }

    const promises: [Promise<DashboardResponse | null>, Promise<any | null>] = [
      apiFetch<DashboardResponse>('dashboard'),
      isExecutive ? apiFetch<any>('dashboard/executive') : Promise.resolve({ success: true, data: null })
    ];

    const [response, execResponse] = await Promise.all(promises);

    if (!response || !execResponse) { showToast('Gagal menghubungi server', true); return; }
    
    if (response.success && execResponse.success) {
      const charts = response.data?.charts;
      if (!charts) { showToast('Data dashboard tidak lengkap', true); return; }
      
      if (isExecutive) {
        if (execResponse.data) renderExecutiveKPI(execResponse.data);
      } else {
        if (response.data?.kpi) renderOperationalKPI(response.data.kpi);
      }

      renderKanbanChart(charts.kanban_status);
      renderStokChart(charts.stok_kategori);
      
      // Update last-updated timestamp
      const el = document.getElementById('last-updated');
      if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else {
      showToast('Server error: ' + (response.message || execResponse.message || 'Unknown'), true);
    }
  } catch (err: any) {
    console.error('Dashboard error:', err);
    showToast('Gagal memuat data dashboard', true);
  }
}

// ============================================================
// RENDER KPI
// ============================================================

async function loadITDashboard(): Promise<void> {
  try {
    const response = await apiFetch<any>('dashboard/it');
    if (response?.success && response.data) {
      const elUsers = document.getElementById('kpi-it-users');
      if (elUsers) elUsers.innerText = String(response.data.active_users);

      const elSessions = document.getElementById('kpi-it-sessions');
      if (elSessions) elSessions.innerText = String(response.data.login_sessions_24h);
    }
  } catch (err) {
    console.error('Fetch IT Dashboard Error:', err);
  }
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function renderExecutiveKPI(metrics: any): void {
  const elAsset = document.getElementById('kpi-asset');
  if (elAsset) elAsset.innerText = formatRupiah(metrics.asset_valuation);

  const elProduction = document.getElementById('kpi-production');
  if (elProduction) elProduction.innerHTML = `<span class="text-emerald-500">${metrics.production_health.completed}</span> / <span class="text-amber-500">${metrics.production_health.in_progress}</span>`;

  const elSales = document.getElementById('kpi-sales');
  if (elSales) elSales.innerText = formatRupiah(metrics.sales_revenue);

  const elAftersales = document.getElementById('kpi-aftersales');
  if (elAftersales) elAftersales.innerText = String(metrics.aftersales_claims);
}

function renderOperationalKPI(kpi: DashboardKPI): void {
  const kpiElements: Record<string, number> = {
    'kpi-pr': kpi.total_pr || 0,
    'kpi-invoice': kpi.total_invoice || 0,
    'kpi-job': kpi.job_selesai || 0,
    'kpi-stok': kpi.stok_komponen || 0,
  };

  Object.entries(kpiElements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = String(value);
  });
}

// ============================================================
// RENDER CHARTS
// ============================================================

function renderKanbanChart(kanbanStatus: ChartItem[]): void {
  const canvas = document.getElementById('kanbanChart') as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn('Kanban chart canvas not found: #kanbanChart');
    return;
  }

  // Destroy previous instance if exists (penting untuk refresh)
  if (kanbanChartInstance) {
    kanbanChartInstance.destroy();
    kanbanChartInstance = null;
  }

  const labels = kanbanStatus.map((item) => item.label);
  const data = kanbanStatus.map((item) => item.data);

  kanbanChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Pekerjaan',
        data,
        backgroundColor: [
          'rgba(59,130,246,0.85)',
          'rgba(16,185,129,0.85)',
          'rgba(245,158,11,0.85)',
          'rgba(239,68,68,0.85)',
          'rgba(139,92,246,0.85)',
        ],
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', weight: 'bold', size: 12 },
          bodyFont: { family: 'Inter', size: 11 },
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: 'Inter', size: 10 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });

  console.log('✓ Kanban chart rendered');
}

function renderStokChart(stokKategori: ChartItem[]): void {
  const canvas = document.getElementById('stokChart') as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn('Stok chart canvas not found: #stokChart');
    return;
  }

  // Destroy previous instance if exists
  if (stokChartInstance) {
    stokChartInstance.destroy();
    stokChartInstance = null;
  }

  const labels = stokKategori.map((item) => item.label);
  const data = stokKategori.map((item) => item.data);
  const total = data.reduce((a, b) => a + b, 0);

  const elTotal = document.getElementById('stok-total-text');
  if (elTotal) elTotal.textContent = total.toLocaleString('id-ID');

  stokChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11 },
            color: '#64748b',
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', weight: 'bold', size: 12 },
          bodyFont: { family: 'Inter', size: 11 },
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });

  console.log('✓ Stok chart rendered');
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Login guard + RBAC (sidebar, header, logout, hamburger)
  const user = initRBAC('dashboard');
  if (!user) return; // User belum login, sudah di-redirect

  const dashOps = document.getElementById('dashboard-operasional');
  const dashIT = document.getElementById('dashboard-it-support');

  // Filter Quick Access Modul berdasarkan role
  const role = user.divisi_role;
  const qaVisibility: Record<string, string[]> = {
    'qa-pengadaan': ['Owner', 'General Manager', 'Pengadaan'],
    'qa-penjualan': ['Owner', 'General Manager', 'Pemasaran & Penjualan'],
    'qa-operasi': ['Owner', 'General Manager', 'Operasi Inti'],
    'qa-gudang': ['Owner', 'General Manager', 'Gudang'],
    'qa-pemasaran': ['Owner', 'General Manager', 'Pemasaran & Penjualan'],
    'qa-keuangan': ['Owner', 'General Manager', 'Keuangan & Akuntansi']
  };

  for (const [id, roles] of Object.entries(qaVisibility)) {
    const el = document.getElementById(id);
    if (el && !roles.includes(role)) {
      el.style.display = 'none';
    }
  }

  // Dynamic Header Title
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    if (user.divisi_role === 'IT Support') {
      pageTitle.textContent = 'Manajemen Sistem';
    } else if (['Owner', 'General Manager'].includes(user.divisi_role)) {
      pageTitle.textContent = 'Ringkasan Eksekutif';
    } else {
      pageTitle.textContent = 'Ringkasan Operasional';
    }
  }

  // 2. Load dashboard data based on role
  if (user.divisi_role === 'IT Support') {
    if (dashOps) dashOps.classList.add('hidden');
    if (dashIT) dashIT.classList.remove('hidden');
    loadITDashboard();
  } else {
    if (dashOps) dashOps.classList.remove('hidden');
    if (dashIT) dashIT.classList.add('hidden');
    loadDashboard(role);
  }

  // 3. Tombol "Segarkan Data"
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (user.divisi_role === 'IT Support') {
        loadITDashboard();
      } else {
        loadDashboard(role);
      }
    });
  }

  // Polling for Real-Time Experience (Every 3 seconds)
  setInterval(() => {
    if (user.divisi_role === 'IT Support') {
      loadITDashboard();
    } else {
      loadDashboard(role);
    }
  }, 3000);
});
