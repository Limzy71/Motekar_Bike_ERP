import { initRBAC } from '../components/rbac.js';
import { apiFetch, getUserData } from '../api.js';

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
}

let allWorkOrders: WorkOrder[] = [];
let currentOpenedWO: WorkOrder | null = null;

let currentPage = 1;
const itemsPerPage = 10;



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

    if (allWorkOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 italic font-medium">Belum ada data Work Order.</td></tr>`;
        updatePaginationUI();
        return;
    }

    const totalItems = allWorkOrders.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const currentItems = allWorkOrders.slice(startIndex, endIndex);

    currentItems.forEach(wo => {
        const isProduction = ['KITTING_RELEASED', 'SUB_ASSEMBLY', 'FINAL_ASSEMBLY', 'TUNING_QC', 'IN_PROGRESS'].includes(wo.status);

        // Status Badge
        let badgeHtml = '';
        if (wo.status === 'DRAFT') {
            badgeHtml = `<span class="bg-slate-100 text-slate-700 font-medium px-2.5 py-0.5 rounded-full">DRAFT</span>`;
        } else if (isProduction) {
            badgeHtml = `<span class="bg-amber-100 text-amber-800 font-medium px-2.5 py-0.5 rounded-full text-[10px]">${wo.status.replace('_', ' ')}</span>`;
        } else if (wo.status === 'COMPLETED') {
            badgeHtml = `<span class="bg-emerald-100 text-emerald-800 font-medium px-2.5 py-0.5 rounded-full">COMPLETED</span>`;
        } else {
            badgeHtml = `<span class="bg-slate-100 text-slate-700 font-medium px-2.5 py-0.5 rounded-full">${wo.status}</span>`;
        }

        // Create Table Row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors duration-150 group cursor-pointer';
        tr.onclick = () => openRightDrawer(wo);

        const dateStr = new Date(wo.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        tr.innerHTML = `
            <td class="py-3 px-4 font-bold font-data-mono text-primary">${wo.nomor_wo}</td>
            <td class="py-3 px-4 text-slate-500">${dateStr}</td>
            <td class="py-3 px-4 font-medium text-slate-800">${wo.produk}</td>
            <td class="py-3 px-4 font-bold text-slate-700 text-right">${wo.jumlah_produksi} Unit</td>
            <td class="py-3 px-4 text-center">${badgeHtml}</td>
            <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all" title="Lihat Detail" onclick="event.stopPropagation(); openRightDrawer(${JSON.stringify(wo).replace(/"/g, '&quot;')})">
                        <span class="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                    ${wo.status === 'COMPLETED' ? `
                    <button class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all" title="Cetak Label QC" onclick="event.stopPropagation(); printQCLabel(${JSON.stringify(wo).replace(/"/g, '&quot;')})">
                        <span class="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

function updatePaginationUI(start = 0, end = 0, total = 0, totalPages = 0) {
    const infoText = document.getElementById('operasi-pagination-info');
    const btnPrev = document.getElementById('operasi-btn-prev') as HTMLButtonElement;
    const btnNext = document.getElementById('operasi-btn-next') as HTMLButtonElement;
    const pagesContainer = document.getElementById('operasi-pagination-pages');

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
        wo.materials.forEach(mat => {
            const isDeficit = mat.stok_committed > mat.jumlah_stok; // Very rough check visually, but actual deficit is prevented at creation
            const statusIcon = wo.status === 'DRAFT' ? 'lock' : 'inventory_2';
            
            bomList.innerHTML += `
                <div class="flex items-center justify-between p-3 rounded-lg border ${isDeficit ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-[18px] text-slate-400">${statusIcon}</span>
                        <div>
                            <p class="text-xs font-bold text-slate-700">${mat.nama_barang}</p>
                            <p class="text-[10px] font-data-mono text-slate-400">${mat.kode_barang}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold font-data-mono text-slate-800">${mat.qty_kebutuhan}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase">Kebutuhan</p>
                    </div>
                </div>
            `;
        });
    } else {
        bomList.innerHTML = `<p class="text-xs text-slate-500 italic">Data BOM tidak tersedia.</p>`;
    }

    // Render Execution Bay (Sequential Vertical Stepper)
    const execBay = document.getElementById('drawer-execution-bay')!;
    execBay.innerHTML = '';
    execBay.className = 'p-6 border-t border-slate-200 bg-slate-50 flex flex-col gap-3 shrink-0';

    const stages: any[] = [
        { id: 'DRAFT', label: 'Release Kitting', next: 'KITTING_RELEASED', icon: 'inventory' },
        { id: 'KITTING_RELEASED', label: 'Mulai Sub-Assembly', next: 'SUB_ASSEMBLY', icon: 'build' },
        { 
            id: 'SUB_ASSEMBLY', 
            label: 'Lanjut Final Assembly', 
            next: 'FINAL_ASSEMBLY', 
            icon: 'pedal_bike',
            metadata: [
                {
                    title: "Langkah 1: Frame Set Assy",
                    time: "15 Menit",
                    tools: "Hex Key Set (4,5,6 mm), Torque Wrench, Bike Repair Stand, Lithium Grease",
                    checklist: ["Mengencangkan baut fork/stem/saddle", "Memastikan kekencangan torsi (Nm)", "Melumasi headtube & seat tube"]
                },
                {
                    title: "Langkah 2: Drivetrain Assy",
                    time: "25 Menit",
                    tools: "Bottom Bracket Tool, Crank Puller, Chain Breaker Tool, Cassette Lockring Tool + Chain Whip",
                    checklist: ["Memasang poros engkol pada frame", "Memasang lengan crankset", "Memotong & menyambung pin rantai", "Mengunci gir cassette"]
                }
            ]
        },
        { 
            id: 'FINAL_ASSEMBLY', 
            label: 'Masuk Tuning & QC', 
            next: 'TUNING_QC', 
            icon: 'rule',
            metadata: [
                {
                    title: "Langkah 3: Cockpit & Controls Assy",
                    time: "15 Menit",
                    tools: "Hex Key Set (4,5 mm), Cable Puller Pliers, Cable Cutter",
                    checklist: ["Menyetel kemiringan stang & tuas rem", "Menarik kawat kabel rem/shifter hingga tegang", "Memotong sisa kawat dengan rapi"]
                }
            ]
        },
        { 
            id: 'TUNING_QC', 
            label: 'Selesai Produksi (Harvest FG)', 
            next: 'COMPLETED', 
            icon: 'check_circle',
            metadata: [
                {
                    title: "Langkah 4: Final Assembly & QC",
                    time: "20 Menit",
                    tools: "Floor Pump with Pressure Gauge, Open-end Wrench (15 mm / QR), Obeng Plus/Minus (PH2)",
                    checklist: ["Memompa ban sesuai PSI standar", "Memasang hub roda ke drop-out frame", "Menyetel baut pembatas (H/L limit screw) pada derailleur"]
                }
            ]
        }
    ];

    if (wo.status === 'CANCELLED') {
        execBay.innerHTML = `<div class="w-full text-center py-2 text-rose-600 font-bold text-sm flex items-center justify-center gap-2"><span class="material-symbols-outlined">cancel</span> WO Dibatalkan</div>`;
    } else if (wo.status === 'COMPLETED') {
        execBay.innerHTML = `<div class="w-full text-center py-2 text-emerald-600 font-bold text-sm flex items-center justify-center gap-2"><span class="material-symbols-outlined">verified</span> Selesai Secara Permanen</div>`;
    } else {
        const currentIndex = stages.findIndex(s => s.id === wo.status);
        
        stages.forEach((stage, index) => {
            const isPast = index < currentIndex;
            const isCurrent = index === currentIndex;
            
            const stageWrapper = document.createElement('div');
            stageWrapper.className = 'flex flex-col gap-2 w-full';

            const btn = document.createElement('button');
            btn.className = `w-full py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between ${
                isPast ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50' :
                isCurrent ? 'bg-primary text-white shadow-md hover:bg-primary-container hover:scale-[1.02]' :
                'bg-white border border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
            }`;
            
            btn.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-[20px]">${stage.icon}</span>
                    <span>${stage.label}</span>
                </div>
                ${isPast ? '<span class="material-symbols-outlined text-[18px]">check</span>' : ''}
            `;
            
            if (isCurrent) {
                btn.onclick = () => handleStateShift(wo.id, stage.next);
            } else {
                btn.disabled = true;
            }
            
            stageWrapper.appendChild(btn);

            // Render Metadata jika state sedang aktif
            if (isCurrent && stage.metadata) {
                const metaContainer = document.createElement('div');
                metaContainer.className = 'ml-4 mt-1 pl-4 border-l-2 border-indigo-200 flex flex-col gap-3 animate-fade-in';
                
                stage.metadata.forEach((meta: any) => {
                    let checklistHtml = meta.checklist.map((item: string) => `
                        <li class="flex items-start gap-2 text-[11px] text-slate-600 group-hover:text-slate-800 transition-colors">
                            <span class="material-symbols-outlined text-[14px] text-slate-300 mt-[1px]">check_box_outline_blank</span>
                            <span class="leading-tight">${item}</span>
                        </li>
                    `).join('');

                    metaContainer.innerHTML += `
                        <div class="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-50/50 to-transparent rounded-bl-full -z-10"></div>
                            
                            <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                                <h4 class="text-xs font-bold text-slate-800 flex items-center gap-2">
                                    <div class="w-5 h-5 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <span class="material-symbols-outlined text-[14px]">assignment</span>
                                    </div>
                                    ${meta.title}
                                </h4>
                                <span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-1 border border-indigo-100">
                                    <span class="material-symbols-outlined text-[12px]">timer</span> ${meta.time}
                                </span>
                            </div>
                            <div class="mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[12px]">handyman</span> Alat Kerja
                                </p>
                                <p class="text-[11px] text-slate-700 font-medium leading-relaxed pl-1">
                                    ${meta.tools}
                                </p>
                            </div>
                            <div>
                                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[12px]">checklist</span> Instruksi Kerja
                                </p>
                                <ul class="flex flex-col gap-2 pl-1">
                                    ${checklistHtml}
                                </ul>
                            </div>
                        </div>
                    `;
                });
                stageWrapper.appendChild(metaContainer);
            }

            execBay.appendChild(stageWrapper);
        });

        // Add Cancel Button for DRAFT and KITTING_RELEASED
        if (wo.status === 'DRAFT' || wo.status === 'KITTING_RELEASED') {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'w-full py-2.5 mt-2 bg-transparent text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs transition-colors flex justify-center items-center gap-2';
            btnCancel.innerHTML = `<span class="material-symbols-outlined text-[16px]">cancel</span> Batalkan Work Order`;
            btnCancel.onclick = () => handleStateShift(wo.id, 'CANCELLED');
            execBay.appendChild(btnCancel);
        }
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
    if (newStatus === 'COMPLETED' && !bypassModal) {
        if (currentOpenedWO && currentOpenedWO.status === 'TUNING_QC') {
            showQcModal(woId);
            return;
        }
    }

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
                closeRightDrawer();
                loadWorkOrders(); // Refresh Kanban Dispenser
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
// 3. QUALITY ASSURANCE GATEWAY (QC MODAL)
// ============================================================
let activeQcWoId: number | null = null;

function showQcModal(woId: number) {
    activeQcWoId = woId;
    const modal = document.getElementById('modal-qc')!;
    const btnSubmit = document.getElementById('btn-submit-qc') as HTMLButtonElement;
    
    // Reset Form
    const radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach((r: any) => r.checked = false);
    (document.getElementById('qc-notes') as HTMLTextAreaElement).value = '';
    
    btnSubmit.disabled = true;
    btnSubmit.className = 'w-full py-3.5 bg-slate-200 text-slate-500 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2';
    btnSubmit.innerHTML = `<span class="material-symbols-outlined text-[20px]">rule</span> Silakan Lengkapi Form QC`;

    modal.classList.remove('hidden');
}

function initQcModal() {
    const modal = document.getElementById('modal-qc')!;
    const btnClose = document.getElementById('btn-close-qc')!;
    const btnSubmit = document.getElementById('btn-submit-qc') as HTMLButtonElement;
    const radios = document.querySelectorAll('#qc-parameters input[type="radio"]');

    const closeModal = () => {
        modal.classList.add('hidden');
        activeQcWoId = null;
    };

    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const frameVal = document.querySelector('input[name="qc_frame"]:checked') as HTMLInputElement;
            const brakeVal = document.querySelector('input[name="qc_brake"]:checked') as HTMLInputElement;
            const driveVal = document.querySelector('input[name="qc_drive"]:checked') as HTMLInputElement;

            if (frameVal && brakeVal && driveVal) {
                btnSubmit.disabled = false;
                const isPassed = frameVal.value === 'pass' && brakeVal.value === 'pass' && driveVal.value === 'pass';

                if (isPassed) {
                    btnSubmit.className = 'w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2';
                    btnSubmit.innerHTML = `<span class="material-symbols-outlined text-[20px]">verified</span> Terbitkan QC Passed & Harvest FG`;
                    btnSubmit.dataset.action = 'COMPLETED';
                } else {
                    btnSubmit.className = 'w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2';
                    btnSubmit.innerHTML = `<span class="material-symbols-outlined text-[20px]">assignment_return</span> Retur untuk Rework`;
                    btnSubmit.dataset.action = 'SUB_ASSEMBLY';
                }
            }
        });
    });

    btnSubmit.addEventListener('click', () => {
        if (!activeQcWoId) return;
        const action = btnSubmit.dataset.action;
        if (action) {
            closeModal();
            // Bypass modal since we already confirmed via QC Form
            handleStateShift(activeQcWoId, action, true);
        }
    });
}

// ============================================================
// 4. CETAK LABEL QC
// ============================================================
(window as any).printQCLabel = (wo: WorkOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const today = new Date().toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});

    printWindow.document.write(`
        <html>
            <head>
                <title>QC Label - ${wo.nomor_wo}</title>
                <style>
                    body { font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f8fafc; }
                    .label { width: 380px; border: 4px solid #0f172a; padding: 24px; background-color: #ffffff; box-sizing: border-box; position: relative; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); }
                    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
                    .logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; margin: 0; color: #0f172a; }
                    .title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 0; text-align: right; color: #475569; }
                    .data-row { margin-bottom: 12px; }
                    .label-text { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 800; display: block; margin-bottom: 2px; letter-spacing: 0.5px; }
                    .value-text { font-size: 16px; font-weight: 700; margin: 0; color: #1e293b; }
                    .qc-stamp { border: 5px solid #10b981; color: #10b981; font-size: 32px; font-weight: 900; text-transform: uppercase; text-align: center; padding: 12px; margin-top: 24px; letter-spacing: 3px; transform: rotate(-4deg); display: block; width: 100%; box-sizing: border-box; border-radius: 8px;}
                    .footer-text { text-align: center; font-size: 9px; color: #94a3b8; font-weight: bold; margin-top: 16px; text-transform: uppercase; }
                    @media print { body { background-color: #ffffff; align-items: flex-start; margin: 0; } .label { box-shadow: none; border-width: 2px; width: 100%; max-width: 380px; } }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="header">
                        <h1 class="logo">MOTEKAR</h1>
                        <p class="title">Product<br>Label</p>
                    </div>
                    <div class="data-row">
                        <span class="label-text">Work Order ID</span>
                        <p class="value-text" style="font-family: monospace; font-size: 18px;">${wo.nomor_wo}</p>
                    </div>
                    <div class="data-row">
                        <span class="label-text">Product Code</span>
                        <p class="value-text" style="font-family: monospace;">${wo.kode_barang}</p>
                    </div>
                    <div class="data-row">
                        <span class="label-text">Product Description</span>
                        <p class="value-text">${wo.produk}</p>
                    </div>
                    <div class="data-row">
                        <span class="label-text">Date Passed (QA)</span>
                        <p class="value-text">${today}</p>
                    </div>
                    
                    <div class="qc-stamp">QC PASSED</div>
                    <p class="footer-text">MOTEKAR QUALITY ASSURANCE DEPARTMENT</p>
                </div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
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
            const fgs = response.data.filter(i => i.kategori === 'FG' || i.kategori === 'Barang Jadi');
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
                    <div class="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors relative" style="padding-left: ${paddingLeft + 1}rem;">
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

            // HUKUM BESI: Disable submit if any deficit
            btnSubmit.disabled = hasDeficit;

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
    initQcModal();
});
