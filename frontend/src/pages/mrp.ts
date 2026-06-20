/**
 * mrp.ts — Logic untuk halaman Material Requirements Planning (MRP) & BOM.
 * Memenuhi spesifikasi Motekar Enterprise Design System (MEDS).
 */

import { apiFetch } from '../api.js';
import { initRBAC, showToast } from '../components/rbac.js';

interface ExplodableItem {
    kode_barang: string;
    nama_barang: string;
    tipe_item: 'FG' | 'SA';
}

interface BOMNode {
    id_bom: string;
    kode_item_parent: string;
    nama_resep: string;
    nama_barang: string;
    children: BOMDetail[];
}

interface BOMDetail {
    kode_item_komponen: string;
    nama_barang: string;
    qty_kebutuhan: number;
    tipe_item: 'RM' | 'SA' | 'FG';
}

interface WOReco {
    kode_sepeda: string;
    nama_barang: string;
    qty: number;
}

interface POReco {
    kode_barang: string;
    nama_barang: string;
    qty: number;
}

interface ExplodeResponse {
    success: boolean;
    data: {
        wo_recommendations: WOReco[];
        po_recommendations: POReco[];
    };
    message?: string;
}

let pendingWO: WOReco[] = [];
let pendingPO: POReco[] = [];
let masterBOM: BOMNode[] = [];

// ============================================================
// UI STATE & TAB NAVIGATION
// ============================================================

function initTabs(): void {
    const tabExplode = document.getElementById('tab-explode');
    const tabMaster = document.getElementById('tab-master');
    const viewExplode = document.getElementById('view-explode');
    const viewMaster = document.getElementById('view-master');

    tabExplode?.addEventListener('click', () => {
        tabExplode.className = 'pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors';
        tabMaster!.className = 'pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors';
        viewExplode?.classList.remove('hidden');
        viewExplode?.classList.add('block');
        viewMaster?.classList.remove('block');
        viewMaster?.classList.add('hidden');
    });

    tabMaster?.addEventListener('click', () => {
        tabMaster.className = 'pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors';
        tabExplode!.className = 'pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors';
        viewMaster?.classList.remove('hidden');
        viewMaster?.classList.add('block');
        viewExplode?.classList.remove('block');
        viewExplode?.classList.add('hidden');
        
        loadMasterBOM(); // Lazy load BOM tree
    });
}

// ============================================================
// DATA FETCHING (MASTER & DROPDOWN)
// ============================================================

async function loadDropdownItems(): Promise<void> {
    const select = document.getElementById('input-explode-item') as HTMLSelectElement;
    if (!select) return;

    try {
        const response = await apiFetch<{success:boolean, data:ExplodableItem[]}>('mrp/items');
        if (response.success) {
            select.innerHTML = '<option value="">-- Pilih Rakitan (FG/SA) --</option>';
            response.data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.kode_barang;
                const typeBadge = item.tipe_item === 'FG' ? 'Finished Goods' : 'Sub-Assembly';
                opt.textContent = `[${item.kode_barang}] ${item.nama_barang} - (${typeBadge})`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        select.innerHTML = '<option value="">Gagal memuat data</option>';
    }
}

async function loadMasterBOM(): Promise<void> {
    const container = document.getElementById('tree-container');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-8 text-xs text-slate-500"><span class="material-symbols-outlined animate-spin text-[24px]">sync</span><br>Memuat pohon struktur BOM...</div>';

    try {
        const response = await apiFetch<{success:boolean, data:BOMNode[]}>('mrp/bom');
        if (response.success) {
            masterBOM = response.data;
            renderTreeGrid(container);
        } else {
            container.innerHTML = `<div class="text-center py-8 text-xs text-rose-500">Gagal memuat BOM.</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="text-center py-8 text-xs text-rose-500">Kesalahan jaringan.</div>`;
    }
}

function renderTreeGrid(container: HTMLElement): void {
    if (masterBOM.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">Belum ada Master Resep BOM yang terdaftar.</div>`;
        return;
    }

    let html = `<div class="border border-slate-200 rounded-lg overflow-hidden bg-white">`;
    
    masterBOM.forEach((node, index) => {
        html += `
            <div class="tree-node border-b border-slate-100 last:border-b-0">
                <!-- Parent Row -->
                <div class="tree-row flex items-center px-4 py-3 gap-3" onclick="toggleTree('tree-${index}')">
                    <span id="icon-tree-${index}" class="tree-toggle material-symbols-outlined text-[20px] text-slate-400 hover:text-slate-700 transition-transform">play_arrow</span>
                    <div class="flex-1">
                        <p class="text-sm font-bold text-slate-800">${node.nama_barang} <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-data-mono">${node.kode_item_parent}</span></p>
                        <p class="text-[11px] text-slate-500 mt-0.5">Resep: ${node.nama_resep}</p>
                    </div>
                </div>
                <!-- Children Container -->
                <div id="tree-${index}" class="tree-children bg-slate-50 border-t border-slate-100 hidden">
        `;
        
        if (node.children.length === 0) {
            html += `<div class="px-10 py-3 text-xs text-slate-400 italic">Tidak ada komponen terdaftar.</div>`;
        } else {
            html += `<table class="w-full text-left">
                        <tbody class="divide-y divide-slate-100 text-xs">`;
            node.children.forEach(child => {
                const colorType = child.tipe_item === 'RM' ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50';
                html += `
                    <tr class="hover:bg-slate-100/50">
                        <td class="pl-12 pr-4 py-2.5 w-1/2">
                            <span class="font-semibold text-slate-700">${child.nama_barang}</span>
                            <span class="text-[10px] text-slate-400 ml-1 font-data-mono">[${child.kode_item_komponen}]</span>
                        </td>
                        <td class="px-4 py-2.5 w-1/4">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${colorType}">${child.tipe_item}</span>
                        </td>
                        <td class="px-4 py-2.5 w-1/4 text-right font-bold text-slate-800">
                            ${child.qty_kebutuhan} Unit
                        </td>
                    </tr>
                `;
            });
            html += `   </tbody>
                     </table>`;
        }
        
        html += `
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach function to global window so onclick works
    (window as any).toggleTree = (id: string) => {
        const el = document.getElementById(id);
        const icon = document.getElementById(`icon-${id}`);
        if (el && icon) {
            if (el.classList.contains('hidden')) {
                el.classList.remove('hidden');
                el.classList.add('block');
                icon.classList.add('rotate-90');
            } else {
                el.classList.add('hidden');
                el.classList.remove('block');
                icon.classList.remove('rotate-90');
            }
        }
    };
}

// ============================================================
// LOGIKA ENGINE EKSPLOSI & BULK EXECUTE
// ============================================================

function initMRPLogic(): void {
    const formExplode = document.getElementById('form-explode') as HTMLFormElement;
    const btnExplode = document.getElementById('btn-explode') as HTMLButtonElement;
    const btnBulk = document.getElementById('btn-bulk-execute') as HTMLButtonElement;
    
    const containerRec = document.getElementById('container-recommendations');
    const tbodyWO = document.getElementById('tbody-wo-reco');
    const tbodyPO = document.getElementById('tbody-po-reco');

    formExplode?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const kodeItem = (document.getElementById('input-explode-item') as HTMLSelectElement).value;
        const qtyTarget = (document.getElementById('input-explode-qty') as HTMLInputElement).value;

        if (!kodeItem || !qtyTarget) return;

        // UI Loading
        btnExplode.disabled = true;
        btnExplode.classList.add('opacity-80', 'cursor-wait');
        btnExplode.querySelector('.icon-bolt')?.classList.add('hidden');
        btnExplode.querySelector('.icon-spin')?.classList.remove('hidden');
        containerRec?.classList.add('hidden'); // Sembunyikan hasil lama

        try {
            const response = await apiFetch<ExplodeResponse>('mrp/explode', {
                method: 'POST',
                body: JSON.stringify({ kode_item: kodeItem, qty_target: qtyTarget })
            });

            if (response.success) {
                pendingWO = response.data.wo_recommendations;
                pendingPO = response.data.po_recommendations;
                
                renderRecommendations(tbodyWO!, tbodyPO!);
                containerRec?.classList.remove('hidden');
                
                // Animasi scroll ke bawah
                setTimeout(() => {
                    containerRec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);

            } else {
                showToast(response.message || 'Gagal meledakkan BOM', true);
            }
        } catch (err) {
            showToast('Terjadi kesalahan koneksi saat kalkulasi.', true);
        } finally {
            btnExplode.disabled = false;
            btnExplode.classList.remove('opacity-80', 'cursor-wait');
            btnExplode.querySelector('.icon-bolt')?.classList.remove('hidden');
            btnExplode.querySelector('.icon-spin')?.classList.add('hidden');
        }
    });

    // Bulk Execute
    btnBulk?.addEventListener('click', async () => {
        if (pendingWO.length === 0 && pendingPO.length === 0) {
            showToast('Tidak ada rekomendasi yang perlu diterbitkan.', true);
            return;
        }

        btnBulk.disabled = true;
        btnBulk.classList.add('opacity-80', 'cursor-wait');
        btnBulk.querySelector('.icon-bulk')?.classList.add('hidden');
        btnBulk.querySelector('.icon-spin-bulk')?.classList.remove('hidden');

        try {
            const response = await apiFetch<{success:boolean, message:string}>('mrp/execute', {
                method: 'POST',
                body: JSON.stringify({ wo_list: pendingWO, po_list: pendingPO })
            });

            if (response.success) {
                showToast(response.message);
                containerRec?.classList.add('hidden');
                pendingWO = [];
                pendingPO = [];
                formExplode.reset();
            } else {
                showToast(response.message, true);
            }
        } catch (err) {
            showToast('Gagal melakukan penerbitan massal.', true);
        } finally {
            btnBulk.disabled = false;
            btnBulk.classList.remove('opacity-80', 'cursor-wait');
            btnBulk.querySelector('.icon-bulk')?.classList.remove('hidden');
            btnBulk.querySelector('.icon-spin-bulk')?.classList.add('hidden');
        }
    });
}

function renderRecommendations(tbodyWO: HTMLElement, tbodyPO: HTMLElement): void {
    tbodyWO.innerHTML = '';
    tbodyPO.innerHTML = '';

    if (pendingWO.length === 0) {
        tbodyWO.innerHTML = `<tr><td colspan="3" class="px-4 py-6 text-center text-xs text-slate-400 italic">Tidak ada rekomendasi perakitan (Stok SA mencukupi).</td></tr>`;
    } else {
        pendingWO.forEach(wo => {
            tbodyWO.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-data-mono text-[11px] text-slate-500">${wo.kode_sepeda}</td>
                    <td class="px-4 py-3 font-bold text-slate-700">${wo.nama_barang}</td>
                    <td class="px-4 py-3 text-right font-black text-blue-600">${wo.qty} <span class="text-[10px] font-normal text-slate-400">Unit</span></td>
                </tr>
            `;
        });
    }

    if (pendingPO.length === 0) {
        tbodyPO.innerHTML = `<tr><td colspan="3" class="px-4 py-6 text-center text-xs text-slate-400 italic">Tidak ada rekomendasi pembelian.</td></tr>`;
    } else {
        pendingPO.forEach(po => {
            tbodyPO.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-data-mono text-[11px] text-slate-500">${po.kode_barang}</td>
                    <td class="px-4 py-3 font-bold text-slate-700">${po.nama_barang}</td>
                    <td class="px-4 py-3 text-right font-black text-amber-600">${po.qty} <span class="text-[10px] font-normal text-slate-400">Pcs</span></td>
                </tr>
            `;
        });
    }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const user = initRBAC('nav-operasi'); // Atur ini masuk di ranah Operasi Inti
    if (!user) return;

    initTabs();
    initMRPLogic();
    loadDropdownItems();

    // Setup Refresh
    document.getElementById('btn-refresh-bom')?.addEventListener('click', loadMasterBOM);
});
