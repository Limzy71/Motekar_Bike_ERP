import { initRBAC } from '../components/rbac.js';
import { apiFetch, getUserData } from '../api.js';
import { renderPaginationUI } from '../utils/pagination.js';
import { openPrintWindow, openReportWindow } from '../utils/printDocument.js';
interface MaterialAllocation {
    qty_kebutuhan: number;
    status_alokasi: string;
    nama_barang: string;
    kode_barang: string;
    jumlah_stok: number;
    stok_committed: number;
}

interface WorkOrder {
    id: number;
    nomor_wo: string;
    jumlah_produksi: number;
    status: string;
    created_at: string;
    produk: string;
    kode_barang: string;
    materials: MaterialAllocation[];
    catatan_rework?: string;
}

let allWorkOrders: WorkOrder[] = [];
let currentOpenedWO: WorkOrder | null = null;

let currentPage = 1;
const itemsPerPage = 10;
let currentFilterMonthWO = '';



function showToast(message: string, type: 'success' | 'error' = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');
    
    if (!toast || !toastIcon || !toastMessage) return;

    toastMessage.textContent = message;
    
    if (type === 'success') {
        toastIcon.textContent = 'check_circle';
        toastIcon.className = 'material-symbols-outlined text-emerald-400';
    } else {
        toastIcon.textContent = 'error';
        toastIcon.className = 'material-symbols-outlined text-rose-400';
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

(window as any).handleStateShift = handleStateShift;

// ============================================================
// 1. THE KANBAN DISPENSER
// ============================================================
async function loadWorkOrders() {
    try {
        const response = await apiFetch<{ success: boolean; data: WorkOrder[] }>('operasi/wo');
        if (!response.success) throw new Error('Gagal mengambil data WO');
        
        allWorkOrders = response.data;
        
        let countDraft = 0;
        let countProgress = 0;
        let countCompleted = 0;
        let kpiDraft = 0; // Menunggu Material
        let kpiSelesaiHariIni = 0;

        const today = new Date().toISOString().split('T')[0];

        allWorkOrders.forEach(wo => {
            const isProduction = ['KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC', 'IN_PROGRESS'].includes(wo.status);
            
            if (wo.status === 'DRAFT') {
                countDraft++;
                kpiDraft++;
            } else if (isProduction) {
                countProgress++;
            } else if (wo.status === 'COMPLETED') {
                countCompleted++;
                if (wo.created_at.includes(today)) { // Simplified check for 'hari ini'
                    kpiSelesaiHariIni++;
                }
            }
        });

        // Update KPIs
        document.getElementById('kpi-wo-aktif')!.textContent = (countDraft + countProgress).toString();
        document.getElementById('kpi-wo-draft')!.textContent = kpiDraft.toString();
        document.getElementById('kpi-wo-selesai')!.textContent = kpiSelesaiHariIni.toString();

        currentPage = 1;
        renderTable();
    } catch (error) {
        showToast('Gagal memuat Work Orders', 'error');
        console.error(error);
    }
}

function renderTable() {
    const tbody = document.getElementById('wo-table-body')!;
    tbody.innerHTML = '';

    let filteredWorkOrders = allWorkOrders;
    
    if (currentFilterMonthWO) {
        filteredWorkOrders = filteredWorkOrders.filter(wo => {
            if (!wo.created_at) return false;
            const date = new Date(wo.created_at);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${year}-${month}` === currentFilterMonthWO;
        });
    }

    if (filteredWorkOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 italic font-medium">Belum ada data Work Order.</td></tr>`;
        renderPaginationUI('operasi-pagination-pagination', 'operasi-pagination-info', 1, itemsPerPage, 0, () => {});
        return;
    }

    const totalItems = filteredWorkOrders.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = filteredWorkOrders.slice(startIndex, endIndex);

    currentItems.forEach(wo => {
        // Status Badge
        let badgeHtml = '';
        if (wo.catatan_rework && wo.status !== 'COMPLETED') {
            badgeHtml = `<span class="bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] shadow-sm flex items-center justify-center gap-1 w-fit mx-auto"><span class="material-symbols-outlined text-[12px]">build</span> REWORK (${wo.status.replace('_', ' ')})</span>`;
        } else if (wo.status === 'DRAFT') {
            badgeHtml = `<span class="bg-slate-100 text-slate-500 font-medium px-2.5 py-0.5 rounded-full text-[10px]">DRAFT</span>`;
        } else if (wo.status === 'KITTING_RELEASED') {
            badgeHtml = `<span class="bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded-full text-[10px]">KITTING RELEASED</span>`;
        } else if (wo.status === 'SUB_ASSEMBLY' || wo.status === 'FINAL_ASSEMBLY' || wo.status === 'TUNING_QC') {
            badgeHtml = `<span class="bg-amber-100 text-amber-800 font-medium px-2.5 py-0.5 rounded-full text-[10px]">${wo.status.replace('_', ' ')}</span>`;
        } else if (wo.status === 'COMPLETED') {
            badgeHtml = `<span class="bg-emerald-100 text-emerald-800 font-medium px-2.5 py-0.5 rounded-full text-[10px]">COMPLETED</span>`;
        } else {
            badgeHtml = `<span class="bg-slate-100 text-slate-700 font-medium px-2.5 py-0.5 rounded-full text-[10px]">${wo.status}</span>`;
        }

        // Create Table Row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-100 transition-colors duration-150 group cursor-pointer';
        tr.onclick = () => openRightDrawer(wo);

        const dateStr = new Date(wo.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        tr.innerHTML = `
            <td class="py-3 px-4 font-bold font-data-mono text-primary">${wo.nomor_wo}</td>
            <td class="py-3 px-4">${dateStr}</td>
            <td class="py-3 px-4 font-semibold">${wo.produk} <span class="text-[10px] text-slate-400 font-normal ml-1 border rounded px-1">${wo.kode_barang}</span></td>
            <td class="py-3 px-4 text-right font-data-mono font-bold text-slate-700">${wo.jumlah_produksi} Unit</td>
            <td class="py-3 px-4 text-center">${badgeHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    renderPaginationUI(
        'operasi-pagination-pagination',
        'operasi-pagination-info',
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
// 2. THE DEEP-DIVE TRIGGER & STATE SHIFTER (Drawer)
// ============================================================
function openRightDrawer(wo: WorkOrder) {
    currentOpenedWO = wo;
    const drawer = document.getElementById('right-drawer');
    const backdrop = document.getElementById('right-drawer-backdrop');
    if (!drawer || !backdrop) return;

    // Set Header Info
    document.getElementById('drawer-wo-id')!.textContent = wo.nomor_wo;
    document.getElementById('drawer-wo-status')!.textContent = wo.status.replace('_', ' ');
    document.getElementById('drawer-product-name')!.textContent = wo.produk;
    document.getElementById('drawer-product-qty')!.textContent = `Qty: ${wo.jumlah_produksi} Unit`;

    // Set Status Badge in Alloc
    const allocStatus = document.getElementById('drawer-alloc-status')!;
    if (wo.status === 'DRAFT') {
        allocStatus.textContent = 'Soft Reserve Active';
        allocStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600';
    } else if (wo.status === 'IN_PROGRESS') {
        allocStatus.textContent = 'Hard Consumed';
        allocStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600';
    } else {
        allocStatus.textContent = 'Completed';
        allocStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600';
    }

    // Render BOM Checklist
    const bomList = document.getElementById('drawer-bom-list')!;
    bomList.innerHTML = '';
    
    if (wo.materials && wo.materials.length > 0) {
        let currentWipHtml = '';
        let currentChildrenHtml = '';
        let resultHtml = '';

        const appendGroup = () => {
            if (currentWipHtml) {
                resultHtml += `
                    <div class="border border-slate-200 rounded-xl overflow-hidden mb-3 bg-white shadow-sm">
                        ${currentWipHtml}
                        ${currentChildrenHtml ? `<div class="bg-slate-50 border-t border-slate-100 p-3 space-y-2 pl-6">${currentChildrenHtml}</div>` : ''}
                    </div>
                `;
            } else if (currentChildrenHtml) {
                resultHtml += `<div class="space-y-2 mb-3">${currentChildrenHtml}</div>`;
            }
        };

        wo.materials.forEach(mat => {
            const isDeficit = mat.stok_committed > mat.jumlah_stok;
            const isWip = mat.kode_barang.startsWith('WIP');
            
            let iconHtml = '';
            if (isWip) {
                const statusIcon = wo.status === 'DRAFT' ? 'lock' : 'account_tree';
                iconHtml = `
                    <div class="w-8 h-8 rounded bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0" title="Barang Setengah Jadi (WIP)">
                        <span class="material-symbols-outlined text-[16px] text-amber-600">${statusIcon}</span>
                    </div>
                `;
            } else {
                const statusIcon = wo.status === 'DRAFT' ? 'lock' : 'inventory_2';
                iconHtml = `
                    <div class="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0" title="Komponen/Material">
                        <span class="material-symbols-outlined text-[16px] text-slate-500">${statusIcon}</span>
                    </div>
                `;
            }

            const badgeWip = isWip ? `<span class="bg-amber-100 text-amber-700 border border-amber-200 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ml-2 align-middle">Sub-Assembly</span>` : '';
            
            const itemHtml = `
                <div class="flex items-center justify-between p-3 ${isWip ? 'bg-white' : 'bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors shadow-sm'} ${isDeficit ? (isWip ? 'bg-rose-50' : 'border-rose-200 bg-rose-50') : ''}">
                    <div class="flex items-center gap-3 relative">
                        ${iconHtml}
                        <div>
                            <p class="text-xs font-bold text-slate-700 flex items-center">${mat.nama_barang} ${badgeWip}</p>
                            <p class="text-[10px] font-data-mono text-slate-500 mt-0.5">${mat.kode_barang}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold font-data-mono text-slate-800">${mat.qty_kebutuhan}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase mt-0.5 tracking-widest">Kebutuhan</p>
                    </div>
                </div>
            `;

            if (isWip) {
                appendGroup();
                currentWipHtml = itemHtml;
                currentChildrenHtml = '';
            } else {
                currentChildrenHtml += itemHtml;
            }
        });
        
        appendGroup();
        bomList.innerHTML = resultHtml;
    } else {
        bomList.innerHTML = `<p class="text-xs text-slate-500 italic">Data BOM tidak tersedia.</p>`;
    }

    // Render Execution Bay (Sequential Vertical Stepper)
    const stepperBay = document.getElementById('drawer-stepper-bay')!;
    stepperBay.innerHTML = '';
    
    const execBay = document.getElementById('drawer-execution-bay')!;
    execBay.innerHTML = '';

    const stages: any[] = [
        { 
            id: 'DRAFT', 
            label: 'Release Kitting', 
            next: 'KITTING_RELEASED', 
            icon: 'inventory',
            metadata: [
                {
                    title: "Tahap 1: Kitting & Pengambilan Material",
                    time: "10 Menit",
                    tools: "Troli Barang, Barcode Scanner, APD (Sarung Tangan)",
                    checklist: [
                        "Mengambil seluruh material komponen dari Gudang Master",
                        "Memverifikasi kesesuaian fisik barang dengan data alokasi BOM",
                        "Memindahkan komponen ke keranjang area transit (Shop Floor)"
                    ]
                }
            ]
        },
        { 
            id: 'KITTING_RELEASED', 
            label: 'Mulai Sub-Assembly', 
            next: 'SUB_ASSEMBLY', 
            icon: 'build'
        },
        { 
            id: 'SUB_ASSEMBLY', 
            label: 'Lanjut Final Assembly', 
            next: 'FINAL_ASSEMBLY', 
            icon: 'pedal_bike',
            metadata: [
                {
                    title: "Langkah 1: Frame Set Assy",
                    time: "15 Menit",
                    tools: "Hex Key Set (Kunci Allen 4, 5, 6 mm), Torque Wrench (Kunci Torsi), Bike Repair Stand (Penyangga Sepeda), Lithium Grease (Pelumas)",
                    checklist: [
                        "Mengencangkan baut fork, stem, dan saddle",
                        "Memastikan kekencangan baut sesuai spesifikasi (Nm)",
                        "Menjepit frame agar stabil saat dirakit",
                        "Melumasi headtube dan seat tube"
                    ]
                },
                {
                    title: "Langkah 2: Wheel Set Assy",
                    time: "20 Menit",
                    tools: "Spoke Wrench, Tire Levers (Congkelan Ban), Truing Stand",
                    checklist: [
                        "Memasang ban dalam dan ban luar pada rims (velg)",
                        "Memastikan posisi bead ban duduk sempurna",
                        "Menyetel ketegangan jari-jari (spoke) agar roda tidak oleng"
                    ]
                },
                {
                    title: "Langkah 3: Drivetrain Assy",
                    time: "25 Menit",
                    tools: "Bottom Bracket Tool, Crank Puller / Hex Tool 8 mm, Chain Breaker Tool (Pemotong Rantai), Cassette Lockring Tool + Chain Whip",
                    checklist: [
                        "Memasang poros engkol pada frame",
                        "Memasang lengan crankset",
                        "Memotong dan menyambung pin rantai",
                        "Mengunci gir cassette pada hub roda belakang"
                    ]
                },
                {
                    title: "Langkah 4: Cockpit & Controls Assy",
                    time: "15 Menit",
                    tools: "Hex Key Set (4, 5 mm), Cable Puller Pliers (Tang Penarik Kabel), Cable Cutter (Pemotong Kabel)",
                    checklist: [
                        "Menyetel kemiringan stang dan tuas rem",
                        "Menarik kabel kawat rem dan shifter hingga tegang",
                        "Memotong sisa kabel kawat dengan rapi"
                    ]
                }
            ]
        },
        { 
            id: 'FINAL_ASSEMBLY', 
            label: 'Serahkan ke Divisi Mutu (QC)', 
            next: 'TUNING_QC', 
            icon: 'rule',
            metadata: [
                {
                    title: "Langkah 5: Final Assembly & QC",
                    time: "20 Menit",
                    tools: "Floor Pump with Pressure Gauge, Open-end Wrench (Kunci Pas 15 mm / Quick Release), Obeng Plus/Minus (Screwdriver PH2)",
                    checklist: [
                        "Menyatukan 4 komponen WIP sehingga jadi sepeda utuh",
                        "Memompa ban sesuai tekanan PSI standar",
                        "Memasang hub roda ke drop-out frame/fork",
                        "Menyetel baut pembatas (H/L limit screw) pada derailleur"
                    ]
                }
            ]
        }
    ];

    if (wo.status === 'CANCELLED') {
        stepperBay.innerHTML = `<div class="w-full text-center py-2 text-rose-600 font-bold text-sm flex items-center justify-center gap-2"><span class="material-symbols-outlined">cancel</span> WO Dibatalkan</div>`;
    } else {
        // Build Horizontal Stepper
        const statusOrder = ['DRAFT', 'KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC', 'COMPLETED'];
        let currentIndex = Math.max(0, statusOrder.indexOf(wo.status) - 1);
        if (wo.status === 'DRAFT') currentIndex = 0; // special case

        const timelineStages = [
            { label: 'KITTING', icon: 'inventory' },
            { label: 'SUB-ASSY', icon: 'build' },
            { label: 'FINAL-ASSY', icon: 'pedal_bike' },
            { label: 'TUNING QC', icon: 'rule' },
            { label: 'SELESAI', icon: 'verified' }
        ];

        let stepperHTML = `<div class="flex items-center justify-between relative mb-8">
            <div class="absolute left-[8%] right-[8%] top-5 h-[2px] bg-slate-200" style="z-index: 1;"></div>`;
        
        timelineStages.forEach((stage, idx) => {
            const isPast = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const circleColor = isPast ? 'bg-[#00288e] text-white border-transparent' : (isCurrent ? 'bg-[#00288e] text-white ring-4 ring-indigo-100 border-transparent' : 'bg-white border-[2.5px] border-slate-200 text-slate-300');
            const textColor = isPast || isCurrent ? 'text-[#00288e]' : 'text-slate-400';
            
            stepperHTML += `
                <div class="flex flex-col items-center gap-2 w-16 relative" style="z-index: 2;">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${circleColor}">
                        <span class="material-symbols-outlined text-[18px]">${stage.icon}</span>
                    </div>
                    <span class="text-[9px] font-bold uppercase tracking-wider text-center ${textColor}">${stage.label}</span>
                </div>
            `;
        });
        stepperHTML += `</div>`;

        // Render Metadata / Checklist
        const stage = stages.find(s => s.id === wo.status);
        if (stage && stage.metadata) {
            let currentMetadata = stage.metadata;
            
            // OVERRIDE JIKA ADA REWORK
            if (wo.catatan_rework && (stage.id === 'SUB_ASSEMBLY' || stage.id === 'FINAL_ASSEMBLY')) {
                currentMetadata = [{
                    title: "INSTRUKSI REWORK (GAGAL QC)",
                    time: "Prioritas",
                    tools: "Fokus pada perbaikan defect berikut",
                    checklist: wo.catatan_rework.split('\n').filter((line: string) => line.trim().length > 0),
                    isRework: true
                }];
            }
            
            let metaHTML = '<div class="flex flex-col gap-4 animate-fade-in">';
            currentMetadata.forEach((meta: any) => {
                let checklistHtml = meta.checklist.map((item: string) => `
                    <li class="flex items-start gap-2 text-[11px] text-slate-600 group-hover:text-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-[14px] text-slate-300 mt-[1px]">check_box_outline_blank</span>
                        <span class="leading-tight">${item}</span>
                    </li>
                `).join('');

                const isRework = meta.isRework;
                const borderClass = isRework ? 'border-rose-300' : 'border-slate-200';
                const gradientClass = isRework ? 'from-rose-50/80' : 'from-slate-50/50';
                const iconBgClass = isRework ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-[#00288e]';
                const iconName = isRework ? 'build_circle' : 'assignment';
                const badgeClass = isRework ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-indigo-700 bg-indigo-50 border-indigo-100';

                metaHTML += `
                    <div class="bg-white border ${borderClass} rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradientClass} to-transparent rounded-bl-full -z-10"></div>
                        
                        <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                            <h4 class="text-sm font-bold ${isRework ? 'text-rose-700' : 'text-slate-800'} flex items-center gap-2">
                                <div class="w-6 h-6 rounded ${iconBgClass} flex items-center justify-center">
                                    <span class="material-symbols-outlined text-[16px]">${iconName}</span>
                                </div>
                                ${meta.title}
                            </h4>
                            <span class="text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 border ${badgeClass}">
                                <span class="material-symbols-outlined text-[12px]">timer</span> ${meta.time}
                            </span>
                        </div>
                        <div class="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">handyman</span> Alat Kerja
                            </p>
                            <p class="text-[12px] text-slate-700 font-medium leading-relaxed pl-1">
                                ${meta.tools}
                            </p>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">checklist</span> Instruksi Kerja
                            </p>
                            <ul class="flex flex-col gap-2.5 pl-1">
                                ${checklistHtml}
                            </ul>
                        </div>
                    </div>
                `;
            });
            metaHTML += '</div>';
            stepperHTML += metaHTML;
        } else if (wo.status === 'TUNING_QC') {
            stepperHTML += `<div class="w-full text-center py-8 text-amber-600 font-bold text-sm flex flex-col items-center justify-center gap-2 bg-amber-50 rounded-xl border border-amber-200 mt-4"><span class="material-symbols-outlined text-4xl">pending</span> Menunggu Inspeksi Divisi Mutu</div>`;
        } else if (wo.status === 'COMPLETED') {
            stepperHTML += `<div class="w-full text-center py-8 text-emerald-600 font-bold text-sm flex flex-col items-center justify-center gap-2 bg-emerald-50 rounded-xl border border-emerald-200 mt-4"><span class="material-symbols-outlined text-4xl">verified</span> Selesai Secara Permanen</div>`;
        } else if (wo.status === 'KITTING_RELEASED') {
            stepperHTML += `<div class="w-full text-center py-8 text-[#00288e] font-bold text-sm flex flex-col items-center justify-center gap-2 bg-indigo-50 rounded-xl border border-indigo-100 mt-4"><span class="material-symbols-outlined text-4xl">inventory_2</span> Material Siap Ditarik ke Lini Sub-Assembly</div>`;
        }

        stepperBay.innerHTML = stepperHTML;

        // Render Action Buttons
        let actionBtnHTML = '';
        if (wo.status === 'DRAFT') {
            actionBtnHTML = `<button class="w-full py-3.5 bg-[#00288e] hover:bg-indigo-800 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'KITTING_RELEASED')">Release Kitting</button>`;
        } else if (wo.status === 'KITTING_RELEASED') {
            actionBtnHTML = `<button class="w-full py-3.5 bg-[#00288e] hover:bg-indigo-800 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'SUB_ASSEMBLY')"><span class="material-symbols-outlined text-[18px]">build</span> Mulai Sub-Assembly</button>`;
        } else if (wo.status === 'SUB_ASSEMBLY') {
            actionBtnHTML = `<button class="w-full py-3.5 bg-[#00288e] hover:bg-indigo-800 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'FINAL_ASSEMBLY')"><span class="material-symbols-outlined text-[18px]">pedal_bike</span> Lanjut Final Assembly</button>`;
        } else if (wo.status === 'FINAL_ASSEMBLY') {
            actionBtnHTML = `<button class="w-full py-3.5 bg-[#00288e] hover:bg-indigo-800 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'TUNING_QC')"><span class="material-symbols-outlined text-[18px]">rule</span> Serahkan ke Divisi Mutu (QC)</button>`;
        } else if (wo.status === 'COMPLETED') {
            actionBtnHTML = `<button class="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="printQCLabel(${JSON.stringify(wo).replace(/"/g, '&quot;')})"><span class="material-symbols-outlined text-[18px]">print</span> Cetak Label QC</button>`;
        }

        if (wo.catatan_rework && (wo.status === 'SUB_ASSEMBLY' || wo.status === 'FINAL_ASSEMBLY')) {
            actionBtnHTML = `<button class="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'TUNING_QC')"><span class="material-symbols-outlined text-[18px]">assignment_return</span> Selesai Rework & Kembalikan ke QC</button>`;
        }

        if (wo.status === 'DRAFT' || wo.status === 'KITTING_RELEASED') {
            actionBtnHTML += `<button class="w-full py-2.5 mt-2 bg-transparent text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs transition-colors flex justify-center items-center gap-2" onclick="handleStateShift(${wo.id}, 'CANCELLED')"><span class="material-symbols-outlined text-[16px]">cancel</span> Batalkan Work Order</button>`;
        }
        
        execBay.innerHTML = actionBtnHTML;
    }

    // Slide in
    backdrop.classList.remove('hidden');
    // small delay to allow display:block to apply before animating transform
    setTimeout(() => {
        drawer.classList.add('open');
    }, 10);
}

function closeRightDrawer() {
    const drawer = document.getElementById('right-drawer');
    const backdrop = document.getElementById('right-drawer-backdrop');
    if (!drawer || !backdrop) return;

    drawer.classList.remove('open');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        currentOpenedWO = null;
    }, 300); // Wait for transition
}

async function handleStateShift(woId: number, newStatus: string, bypassModal: boolean = false) {

    let confirmTitle = 'Ubah Status?';
    let confirmText = '';
    let confirmColor = '#00288e';

    if (newStatus === 'IN_PROGRESS') {
        confirmTitle = 'Mulai Produksi?';
        confirmText = 'Material akan dikonsumsi secara permanen dari gudang (Hard Consume).';
        confirmColor = '#f59e0b';
    } else if (newStatus === 'COMPLETED') {
        confirmTitle = 'Selesai & Lolos QC?';
        confirmText = 'Barang jadi (Finished Good) akan ditambahkan ke Master Stok.';
        confirmColor = '#10b981';
    } else if (newStatus === 'CANCELLED') {
        confirmTitle = 'Batalkan Work Order?';
        confirmText = 'Reservasi stok material akan dilepas dan WO akan hangus.';
        confirmColor = '#e11d48';
    }

    // @ts-ignore
    const result = await Swal.fire({
        title: confirmTitle,
        text: confirmText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Eksekusi!',
        cancelButtonText: 'Kembali'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch<{success: boolean, message: string}>(`operasi/wo/${woId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });

            if (response.success) {
                showToast(response.message, 'success');
                await loadWorkOrders(); // Wait for data to refresh
                
                if (newStatus !== 'CANCELLED' && newStatus !== 'COMPLETED' && currentOpenedWO) {
                    const updatedWO = allWorkOrders.find((w: WorkOrder) => w.id === woId);
                    if (updatedWO) {
                        openRightDrawer(updatedWO); // Re-render inside the same open drawer
                    } else {
                        closeRightDrawer();
                    }
                } else {
                    closeRightDrawer();
                }
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (error: any) {
            // @ts-ignore
            Swal.fire('Gagal!', error.message, 'error');
        }
    }
}



// ============================================================
// 4. CETAK DOKUMEN QC
// ============================================================
(window as any).printQCLabel = (wo: WorkOrder) => {
    const today = new Date().toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
    const catatan = wo.catatan_rework ? wo.catatan_rework.replace(/\n/g, '<br>') : 'Tidak ada catatan khusus. Unit dirakit sesuai standar ISO 4210.';
    const teknisi = 'Tim Perakitan Motekar';
    const bomRef = `BOM-${wo.kode_barang}`;

    openPrintWindow({
        docType: 'Quality Control Certificate',
        docNumber: `QC-${wo.nomor_wo}`,
        docDate: today,
        status: 'PASSED',
        headerFields: [
            { label: 'Work Order ID', value: wo.nomor_wo },
            { label: 'BOM Reference', value: bomRef },
            { label: 'Nama Produk', value: wo.produk },
            { label: 'Kode Produk', value: wo.kode_barang },
            { label: 'Teknisi', value: teknisi },
            { label: 'Assembly Progress', value: '100% Completed' },
            { label: 'Production Target', value: `${wo.jumlah_produksi} Unit` },
            { label: 'QC Status', value: 'Approved / Passed' }
        ],
        columns: [
            { label: 'No', key: 'no', align: 'center' },
            { label: 'Parameter Inspeksi (ISO 4210)', key: 'parameter', align: 'left' },
            { label: 'Metode Pengujian', key: 'metode', align: 'left' },
            { label: 'Hasil', key: 'hasil', align: 'center' }
        ],
        items: [
            { no: '1', parameter: 'Audit Torsi Baut & Struktural', metode: 'Torque Wrench Calibration', hasil: '✅ PASS' },
            { no: '2', parameter: 'Truing Roda & Tensionometri', metode: 'Spoke Tension Meter', hasil: '✅ PASS' },
            { no: '3', parameter: 'Integritas Seal Hidrolik & Rotor', metode: 'Pressure Retention Test', hasil: '✅ PASS' },
            { no: '4', parameter: 'Presisi Indexing Shifting', metode: 'Dynamic Shifting Test', hasil: '✅ PASS' },
            { no: '5', parameter: 'Verifikasi VIN & Estetika Cat', metode: 'Visual & Scanner', hasil: '✅ PASS' }
        ],
        notes: catatan,
        signatures: [
            { title: 'Quality Inspector', name: 'Tim QA Motekar' },
            { title: 'Production Manager', name: 'Manajer Produksi' }
        ]
    });
};


// ============================================================
// 5. LIVE DEFICIT RADAR (Create Modal)
// ============================================================
async function initCreateModal() {
    const modal = document.getElementById('modal-create-wo')!;
    const btnNewWO = document.getElementById('btn-new-wo')!;
    const btnClose = document.getElementById('btn-close-modal')!;
    const btnCancel = document.getElementById('btn-cancel-modal')!;
    const btnSubmit = document.getElementById('btn-submit-wo') as HTMLButtonElement;
    const selectFg = document.getElementById('select-fg') as HTMLSelectElement;
    const inputQty = document.getElementById('input-qty') as HTMLInputElement;

    // Load FG list from Gudang
    try {
        const response = await apiFetch<{success: boolean, data: any[]}>('gudang');
        if (response.success) {
            const fgs = response.data.filter(i => i.tipe_item === 'FG');
            fgs.forEach(fg => {
                const opt = document.createElement('option');
                opt.value = fg.id;
                opt.dataset.kode = fg.kode_barang; // need this for BOM explosion
                opt.textContent = `[${fg.kode_barang}] ${fg.nama_barang} (Stok: ${fg.jumlah_stok})`;
                selectFg.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load FG items', e);
    }

    // Handlers
    btnNewWO.onclick = () => {
        modal.classList.remove('hidden');
        selectFg.value = '';
        inputQty.value = '';
        document.getElementById('radar-content')!.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">Pilih produk dan masukkan qty untuk memulai pemindaian stok.</div>';
        btnSubmit.disabled = true;
    };

    const closeModal = () => modal.classList.add('hidden');
    btnClose.onclick = closeModal;
    btnCancel.onclick = closeModal;

    // Auto-Close Modal pada backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Live Radar Trigger
    selectFg.addEventListener('change', () => {
        if (selectFg.value) {
            const currentQty = parseInt(inputQty.value);
            if (isNaN(currentQty) || currentQty < 1) {
                inputQty.value = '1';
            }
        } else {
            inputQty.value = '';
        }
        runDeficitRadar();
    });

    inputQty.addEventListener('input', () => {
        if (inputQty.value === '') {
            runDeficitRadar();
            return;
        }
        const val = parseInt(inputQty.value);
        if (val < 1) {
            inputQty.value = '1';
        }
        runDeficitRadar();
    });

    inputQty.addEventListener('blur', () => {
        if (selectFg.value && (inputQty.value === '' || parseInt(inputQty.value) < 1)) {
            inputQty.value = '1';
            runDeficitRadar();
        }
    });

    async function runDeficitRadar() {
        const idFg = selectFg.value;
        const qty = parseInt(inputQty.value);
        const radarContent = document.getElementById('radar-content')!;

        if (!idFg || isNaN(qty) || qty <= 0) {
            radarContent.innerHTML = '<div class="text-center text-slate-500 text-xs py-8">Pilih produk dan masukkan qty valid untuk pemindaian.</div>';
            btnSubmit.disabled = true;
            return;
        }

        radarContent.innerHTML = '<div class="text-center text-tertiary-fixed-dim text-xs py-8 animate-pulse">Memindai Database Master Stok...</div>';
        btnSubmit.disabled = true; // disable while scanning

        const selectedOption = selectFg.options[selectFg.selectedIndex];
        const kodeBarang = selectedOption.dataset.kode;

        try {
            const response = await apiFetch<{success: boolean, data: any[]}>(`operasi/wo/bom-explosion/${kodeBarang}/${qty}`);
            if (!response.success) throw new Error('BOM tidak ditemukan');

            const explosion = response.data;
            radarContent.innerHTML = '';
            
            let hasDeficit = false;

            if (explosion.length === 0) {
                radarContent.innerHTML = '<div class="text-center text-rose-400 text-xs py-8">BOM tidak terkonfigurasi untuk produk ini!</div>';
                return;
            }

            explosion.forEach((item: any) => {
                if (item.is_deficit && !item.is_phantom) hasDeficit = true;

                const paddingLeft = item.level * 1.5; // rem
                
                let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                let iconClass = 'check_circle';
                let statusText = `Aman (Sisa ${item.stok_tersedia - item.qty_allocated})`;

                if (item.is_phantom) {
                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                    iconClass = 'account_tree';
                    statusText = 'Auto-Explode';
                } else if (item.is_deficit) {
                    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                    iconClass = 'warning';
                    statusText = `Kurang ${item.deficit_amount}`;
                }

                const borderLeftStyle = item.level > 0 ? `border-left: 2px solid #e2e8f0;` : '';

                radarContent.innerHTML += `
                    <div class="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-100 transition-colors relative" style="padding-left: ${paddingLeft + 1}rem;">
                        <div class="absolute left-0 top-0 bottom-0" style="margin-left: ${paddingLeft === 0 ? 0 : paddingLeft + 1 - 0.75}rem; ${borderLeftStyle}"></div>
                        
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                            <p class="text-sm leading-snug ${item.is_phantom ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}">
                                ${item.nama_barang} ${item.is_phantom ? '<span class="text-[9px] ml-1 font-bold border border-amber-200 bg-amber-50 px-1 rounded text-amber-700">WIP</span>' : ''}
                            </p>
                        </div>

                        <div class="flex-shrink-0 flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 text-right">
                            <p class="text-xs text-slate-500">Butuh: <span class="font-bold text-slate-800">${item.total_kebutuhan}</span> <span class="mx-1 text-slate-300">|</span> Sisa: <span class="${item.stok_tersedia < item.total_kebutuhan ? 'font-bold text-rose-600' : 'font-bold text-slate-800'}">${item.stok_tersedia}</span></p>
                            <div class="flex items-center gap-1 border ${badgeClass} px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider min-w-[100px] justify-center">
                                <span class="material-symbols-outlined text-[14px]">${iconClass}</span>
                                <span>${statusText}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            // [AUTO-RESTOCK] Tidak lagi di-disable jika defisit, karena backend akan otomatis membuat Material Request
            btnSubmit.disabled = false;

        } catch (error) {
            radarContent.innerHTML = `<div class="text-center text-rose-400 text-xs py-8">Gagal memuat BOM. Pastikan master BOM tersedia.</div>`;
            // FALLBACK AMAN: Jangan lock tombol Terbitkan jika BOM API gagal
            btnSubmit.disabled = false;
        }
    }

    // Submit Work Order
    btnSubmit.onclick = async () => {
        try {
            const response = await apiFetch<{success: boolean, message: string}>('operasi/wo', {
                method: 'POST',
                body: JSON.stringify({
                    id_inventory_fg: parseInt(selectFg.value),
                    jumlah_produksi: parseInt(inputQty.value)
                })
            });

            if (response.success) {
                showToast(response.message, 'success');
                closeModal();
                loadWorkOrders();
            } else {
                // @ts-ignore
                Swal.fire('Gagal!', response.message, 'error');
            }
        } catch (e: any) {
            // @ts-ignore
            Swal.fire('Gagal!', e.message, 'error');
        }
    };
}


// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initRBAC('Operasi Inti');
    
    // Header setup handled by initRBAC

    // Drawer bindings
    document.getElementById('btn-close-drawer')?.addEventListener('click', closeRightDrawer);
    document.getElementById('right-drawer-backdrop')?.addEventListener('click', closeRightDrawer);

    // Init modules
    loadWorkOrders();
    initCreateModal();

    // Event Listeners for Filters and Report
    const filterMonthWO = document.getElementById('filter-month-wo') as HTMLSelectElement;
    if (filterMonthWO) {
        filterMonthWO.addEventListener('change', (e) => {
            currentFilterMonthWO = (e.target as HTMLSelectElement).value;
            currentPage = 1;
            renderTable();
        });
    }

    const btnPrintReportWO = document.getElementById('btn-print-report-wo');
    if (btnPrintReportWO) {
        btnPrintReportWO.addEventListener('click', () => {
            let filteredData = allWorkOrders;
            
            if (currentFilterMonthWO) {
                filteredData = filteredData.filter(wo => {
                    if (!wo.created_at) return false;
                    const date = new Date(wo.created_at);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${year}-${month}` === currentFilterMonthWO;
                });
            }
            
            if (filteredData.length === 0) {
                // @ts-ignore
                Swal.fire('Info', 'Tidak ada data Work Order untuk dicetak.', 'info');
                return;
            }
            
            const subtitle = currentFilterMonthWO ? `Filter: Bulan ${currentFilterMonthWO}` : 'Semua Work Order';
            
            openReportWindow({
                title: 'Laporan Rekapitulasi Produksi (Work Order)',
                subtitle: subtitle,
                columns: [
                    { label: 'Nomor WO', key: 'nomor_wo' },
                    { label: 'Tanggal Mulai', key: 'created_at', format: (val) => new Date(val).toLocaleDateString('id-ID') },
                    { label: 'Kode Item', key: 'kode_barang' },
                    { label: 'Nama Produk', key: 'produk' },
                    { label: 'Target', key: 'jumlah_produksi', align: 'center', format: (val) => `${val} Unit` },
                    { label: 'Status WO', key: 'status', align: 'center' }
                ],
                data: filteredData
            });
        });
    }

    // Polling for Real-Time Experience (Every 15 seconds for Shop Floor)
    setInterval(() => {
        loadWorkOrders();
    }, 15000);
});
