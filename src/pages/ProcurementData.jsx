import { useState, useEffect, useMemo, useRef } from 'react';
import { PackageSearch, Search, SlidersHorizontal, Loader2, FileDown, CheckSquare, X, ChevronDown } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchAllProcurementStocks } from '../services/procurementService';
import { supabase } from '../services/supabaseClient';
import { getEdCategory, formatDate, CATEGORIES } from '../utils/edHelpers';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import styles from './Dashboard.module.css';
import OutletInputStyles from './OutletInputPage.module.css';

const formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatNum = (n) => Number(n || 0).toFixed(2);

// === CSV HELPER ===
const csvCell = (val) => {
    const str = String(val === null || val === undefined ? '' : val);
    // Wrap in quotes if contains comma, newline, or double-quote
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};
// Excel-safe for numeric strings with leading zeros
const csvCodeCell = (val) => `"=""${String(val || '')}"""`;

const triggerDownload = (csvContent, filename) => {
    // BOM for Excel UTF-8 support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export default function ProcurementData() {
    const user = useAuthStore((s) => s.user);

    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOutlet, setSelectedOutlet] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [selectedProcId, setSelectedProcId] = useState('');
    const [isRounding, setIsRounding] = useState(false); // Opsi Pembulatan

    // Procode Exclude Set — kode produk yang tidak boleh mendapat opsi "Diskon Promosi Khusus"
    const [excludedCodes, setExcludedCodes] = useState(new Set());

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50; // reduced to 50 for snappier dom

    // Multi-Selection State
    const [selectedRows, setSelectedRows] = useState([]);

    // Modal State
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [actionMain, setActionMain] = useState('');
    const [actionDetails, setActionDetails] = useState({});
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);

    // Export States
    const [isExportingDetail, setIsExportingDetail] = useState(false);
    const [isExportingRekap, setIsExportingRekap] = useState(false);
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
    const [toast, setToast] = useState(null); // { message, type }
    const exportDropdownRef = useRef(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
                setExportDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        setError('');
        try {
            const [stocks, excludeRes] = await Promise.all([
                fetchAllProcurementStocks(),
                supabase.from('procode_exclude').select('product_code')
            ]);
            setStocks(stocks);
            if (!excludeRes.error && excludeRes.data) {
                setExcludedCodes(new Set(excludeRes.data.map(r => String(r.product_code).trim())));
            }
        } catch (err) {
            setError('Gagal memuat data: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    const filterOptions = useMemo(() => {
        const outletSet = new Set();
        const supSet = new Set();
        const procSet = new Set();

        stocks.forEach(s => {
            if (s.outlet_name) outletSet.add(s.outlet_name);
            const vendor = s.master_products?.supplier || s.master_products?.supplier_name;
            if (vendor) supSet.add(vendor);
            if (s.master_products?.procurement_id) procSet.add(s.master_products.procurement_id);
        });

        return {
            outlets: Array.from(outletSet).sort(),
            suppliers: Array.from(supSet).sort(),
            procIds: Array.from(procSet).sort()
        };
    }, [stocks]);

    const filteredData = useMemo(() => {
        return stocks.reduce((acc, item) => {
            if (selectedCategory && getEdCategory(item.ed_date) !== selectedCategory) return acc;
            if (selectedOutlet && item.outlet_name !== selectedOutlet) return acc;
            const vendor = item.master_products?.supplier || item.master_products?.supplier_name;
            if (selectedSupplier && vendor !== selectedSupplier) return acc;
            if (selectedProcId && item.master_products?.procurement_id !== selectedProcId) return acc;

            if (getEdCategory(item.ed_date) === 'terkumpul') return acc;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const code = (item.product_code || '').toLowerCase();
                const name = (item.master_products?.item_description || '').toLowerCase();
                if (!code.includes(q) && !name.includes(q)) return acc;
            }

            const rawQty = parseFloat(item.qty) || 0;
            const displayQty = isRounding ? Math.floor(rawQty) : rawQty;
            if (displayQty > 0) acc.push({ ...item, qty: displayQty });

            return acc;
        }, []);
    }, [stocks, searchQuery, selectedOutlet, selectedCategory, selectedSupplier, selectedProcId, isRounding]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedOutlet, selectedCategory, selectedSupplier, selectedProcId, isRounding]);

    // Group By Barcode
    const aggregatedData = useMemo(() => {
        const grouped = {};
        filteredData.forEach(item => {
            const pCode = item.product_code;
            if (!grouped[pCode]) {
                grouped[pCode] = {
                    id: pCode,
                    product_code: pCode,
                    itemName: item.master_products?.item_description || 'Unknown Item',
                    supplierInfo: `${item.master_products?.procurement_id || '-'} - ${item.master_products?.supplier || item.master_products?.supplier_name || 'Tanpa Supplier'}`,
                    categories: new Set(),
                    earliestDate: item.ed_date,
                    batches: new Set(),
                    totalQty: 0,
                    outlets: new Set(),
                    unitCost: Number(item.master_products?.unit_cost_with_vat) || 0,
                    rekomendasi: item.rekomendasi || item.status_action || ''
                };
            }
            const g = grouped[pCode];
            g.categories.add(getEdCategory(item.ed_date));
            if (item.ed_date < g.earliestDate) g.earliestDate = item.ed_date;
            if (item.batch_id) g.batches.add(item.batch_id);
            g.totalQty += item.qty;
            g.outlets.add(item.outlet_code);
            if (item.rekomendasi) g.rekomendasi = item.rekomendasi;
            else if (item.status_action) g.rekomendasi = item.status_action;
        });

        return Object.values(grouped).map(g => {
            let qty = g.totalQty;
            if (isRounding) qty = Math.floor(qty);
            return {
                ...g,
                totalQty: qty,
                totalCost: qty * g.unitCost,
                primaryCategory: Array.from(g.categories).sort((a, b) => {
                    const order = ['terkumpul', 'bulanIni', '1to3', '4to6', '7to12', 'other'];
                    return order.indexOf(a) - order.indexOf(b);
                })[0] || 'other'
            };
        }).sort((a, b) => b.totalCost - a.totalCost);
    }, [filteredData, isRounding]);

    const totalPages = Math.max(1, Math.ceil(aggregatedData.length / itemsPerPage));
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return aggregatedData.slice(startIndex, startIndex + itemsPerPage);
    }, [aggregatedData, currentPage, itemsPerPage]);

    // ====== CSV EXPORT FUNCTIONS ======

    // ── CSV DATE BOUNDARY ─────────────────────────────────────────────────────
    // Export mencakup semua data aktif (filteredData) + terkumpul dari Sep 2025+
    const CSV_MIN_DATE = '2025-09-01';

    const exportDetailData = useMemo(() => {
        const terkumpulRows = stocks.filter(item => {
            if (getEdCategory(item.ed_date) !== 'terkumpul') return false;
            const edDate = item.ed_date || '';
            const inputDate = (item.input_period || item.created_at || '').slice(0, 10);
            // Include if either ed_date OR input_date is within range
            return edDate >= CSV_MIN_DATE || inputDate >= CSV_MIN_DATE;
        });
        return [...filteredData, ...terkumpulRows];
    }, [filteredData, stocks]);

    /**
     * Export Tipe 1: Detail — satu baris per item stok mentah
     */
    const handleExportDetail = async () => {
        if (isExportingDetail || exportDetailData.length === 0) return;
        setIsExportingDetail(true);
        setExportDropdownOpen(false);

        await new Promise(r => setTimeout(r, 50));

        try {
            const header = ['Kategori', 'Nama Apotek', 'Nama Produk', 'Kode Produk', 'Batch ID', 'Tanggal ED', 'Qty', 'Cost per Unit', 'Total Cost', 'Status Aksi'];
            const rows = exportDetailData.map(item => {
                const cat = CATEGORIES.find(c => c.key === getEdCategory(item.ed_date))?.label || getEdCategory(item.ed_date);
                const unitCost = Number(item.master_products?.unit_cost_with_vat) || 0;
                const totalCost = (item.qty || 0) * unitCost;
                const statusAksi = item.rekomendasi || item.status_action || '';
                return [
                    csvCell(cat),
                    csvCell(item.outlet_name || item.outlet_code),
                    csvCell(item.master_products?.item_description || item.product_code),
                    csvCodeCell(item.product_code),
                    csvCell(item.batch_id || ''),
                    csvCell(item.ed_date || ''),
                    csvCell(formatNum(item.qty)),
                    csvCell(unitCost),
                    csvCell(totalCost),
                    csvCell(statusAksi)
                ].join(',');
            });

            const csv = [header.join(','), ...rows].join('\n');
            const today = new Date().toISOString().slice(0, 10);
            triggerDownload(csv, `ShortED_Detail_${today}.csv`);
            showToast(`✅ ${exportDetailData.length} baris berhasil diekspor sebagai Detail CSV!`);
        } catch (e) {
            showToast('❌ Gagal mengekspor: ' + e.message, 'error');
        } finally {
            setIsExportingDetail(false);
        }
    };

    /**
     * Export Tipe 2: Rekap — digroup per kode produk (aggregatedData + terkumpul Sep 2025+)
     */
    const handleExportRekap = async () => {
        if (isExportingRekap || exportDetailData.length === 0) return;
        setIsExportingRekap(true);
        setExportDropdownOpen(false);

        await new Promise(r => setTimeout(r, 50));

        try {
            // Re-aggregate exportDetailData (includes terkumpul) by product_code
            const grouped = {};
            exportDetailData.forEach(item => {
                const pCode = item.product_code;
                const unitCost = Number(item.master_products?.unit_cost_with_vat) || 0;
                if (!grouped[pCode]) {
                    grouped[pCode] = {
                        product_code: pCode,
                        itemName: item.master_products?.item_description || pCode,
                        supplierInfo: `${item.master_products?.procurement_id || '-'} - ${item.master_products?.supplier || item.master_products?.supplier_name || 'Tanpa Supplier'}`,
                        primaryCategory: getEdCategory(item.ed_date),
                        totalQty: 0,
                        outlets: new Set(),
                        unitCost,
                        rekomendasi: item.rekomendasi || item.status_action || ''
                    };
                }
                const g = grouped[pCode];
                g.totalQty += parseFloat(item.qty) || 0;
                g.outlets.add(item.outlet_code);
                if (item.rekomendasi) g.rekomendasi = item.rekomendasi;
                else if (item.status_action && !g.rekomendasi) g.rekomendasi = item.status_action;
            });

            const rekapRows = Object.values(grouped);
            const header = ['Kategori ED', 'Supplier', 'Nama Produk', 'Kode Produk', 'Sisa Stok', 'Jumlah Apotek', 'Cost Per Unit', 'Total Cost', 'Status Aksi'];
            const rows = rekapRows.map(group => {
                const catLabel = CATEGORIES.find(c => c.key === group.primaryCategory)?.label || group.primaryCategory;
                const qty = isRounding ? Math.floor(group.totalQty) : group.totalQty;
                return [
                    csvCell(catLabel),
                    csvCell(group.supplierInfo),
                    csvCell(group.itemName),
                    csvCodeCell(group.product_code),
                    csvCell(formatNum(qty)),
                    csvCell(group.outlets.size),
                    csvCell(group.unitCost),
                    csvCell(qty * group.unitCost),
                    csvCell(group.rekomendasi || '')
                ].join(',');
            });

            const csv = [header.join(','), ...rows].join('\n');
            const today = new Date().toISOString().slice(0, 10);
            triggerDownload(csv, `ShortED_Rekap_${today}.csv`);
            showToast(`✅ ${rekapRows.length} produk berhasil diekspor sebagai Rekap CSV!`);
        } catch (e) {
            showToast('❌ Gagal mengekspor: ' + e.message, 'error');
        } finally {
            setIsExportingRekap(false);
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedRows([...paginatedData]);
        else setSelectedRows([]);
    };

    const handleSelectRow = (group, checked) => {
        if (checked) setSelectedRows(prev => [...prev, group]);
        else setSelectedRows(prev => prev.filter(r => r.id !== group.id));
    };

    const handleSubmitAksi = async () => {
        if (selectedRows.length === 0 || !actionMain) return;
        setIsSubmittingAction(true);

        try {
            let detailAksiString = '';
            if (actionMain === 'Reduce To Clear') detailAksiString = `Diskon: ${actionDetails.diskon || '-'}% (Rp ${actionDetails.diskonRp || '-'}) | Periode: ${actionDetails.periodeAwal || '-'} s/d ${actionDetails.periodeAkhir || '-'}`;
            else if (actionMain === 'TN antar Outlet') detailAksiString = `Tujuan: ${actionDetails.tokoTujuan || '-'} | Periode: ${actionDetails.periodeAwal || '-'} s/d ${actionDetails.periodeAkhir || '-'}`;
            else if (actionMain === 'Retur') detailAksiString = `Ke: ${actionDetails.returKe || '-'} | Periode: ${actionDetails.periodeAwal || '-'} s/d ${actionDetails.periodeAkhir || '-'}`;
            else if (actionMain === 'Tukar Guling') detailAksiString = `Mekanisme: ${actionDetails.mekanisme || '-'} | Periode: ${actionDetails.periodeAwal || '-'} s/d ${actionDetails.periodeAkhir || '-'}`;
            else if (actionMain === 'Write Off') detailAksiString = `Ketentuan: ${actionDetails.ketentuan || '-'}`;
            else if (actionMain === 'Other') detailAksiString = `Deskripsi: ${actionDetails.deskripsi || '-'}`;

            const listKodeProdukUnik = [...new Set(selectedRows.map(g => String(g.product_code).trim()))];

            // 1. UPSERT ke tabel procurement_decisions
            const decisionPayload = selectedRows.map(group => ({
                kode_produk: group.product_code,
                nama_produk: group.itemName,
                aksi_utama: actionMain,
                detail_aksi: detailAksiString,
                updated_at: new Date().toISOString(),
                updated_by: user?.email || user?.name || 'Sistem Procurement'
            }));

            const { error: decError } = await supabase
                .from('procurement_decisions')
                .upsert(decisionPayload, { onConflict: 'kode_produk' });

            if (decError) throw new Error(`Gagal menyimpan keputusan pusat: ${decError.message}`);

            // 2. UPDATE massal ke tabel stocks_ed
            const { error: updError } = await supabase
                .from('stocks_ed')
                .update({
                    rekomendasi: `${actionMain} - ${detailAksiString}`,
                    status_action: actionMain
                })
                .in('product_code', listKodeProdukUnik);

            if (updError) throw new Error(`Gagal menyebarkan rekomendasi ke apotek: ${updError.message}`);

            setIsActionModalOpen(false);
            setSelectedRows([]);
            setActionMain('');
            setActionDetails({});
            alert('Aksi massal berhasil dieksekusi dan disebarkan ke semua outlet!');
            loadData();
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const renderActionModal = () => {
        if (!isActionModalOpen) return null;

        return (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Eksekusi Aksi Procurement</h3>
                        <button onClick={() => setIsActionModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                    </div>

                    <div className={OutletInputStyles.alert} style={{ marginBottom: '16px', background: 'var(--blue-light)', color: 'var(--blue)', borderColor: 'var(--blue)' }}>
                        Anda akan menerapkan aksi untuk <strong>{selectedRows.length}</strong> produk unik. Tindakan ini merupakan operasi Global yang akan memperbarui rekomendasi ke SKU seluruh apotek cabang.
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Pilih Aksi Utama</label>
                        <select className="input-field" value={actionMain} onChange={e => { setActionMain(e.target.value); setActionDetails({}); }} style={{ width: '100%', fontSize: '0.9rem', borderColor: 'var(--primary)' }}>
                            <option value="">-- Tentukan Aksi --</option>
                            <option value="Reduce To Clear">Reduce To Clear</option>
                            <option value="TN antar Outlet">TN antar Outlet</option>
                            <option value="Retur">Retur</option>
                            <option value="Tukar Guling">Tukar Guling</option>
                            <option value="Write Off">Write Off</option>
                            {/* Diskon Promosi Khusus: TIDAK tampil jika semua produk terpilih ada di procode_exclude
                                dan kategorinya adalah 1-3 bln, 4-6 bln, atau 7-12 bln */}
                            {!selectedRows.every(r =>
                                excludedCodes.has(String(r.product_code).trim()) &&
                                ['1to3', '4to6', '7to12'].includes(r.primaryCategory)
                            ) && (
                                    <option value="Diskon Promosi Khusus">Diskon Promosi Khusus</option>
                                )}
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Cascading Fields - Field Turunan Dinamis */}
                    {actionMain === 'Reduce To Clear' && (
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Diskon (%)</label><input type="number" className="input-field" value={actionDetails.diskon || ''} onChange={e => setActionDetails({ ...actionDetails, diskon: e.target.value })} style={{ width: '100%' }} /></div>
                            <div style={{ flex: 1 }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Potongan Nominal (Rp)</label><input type="number" className="input-field" value={actionDetails.diskonRp || ''} onChange={e => setActionDetails({ ...actionDetails, diskonRp: e.target.value })} style={{ width: '100%' }} /></div>
                        </div>
                    )}
                    {actionMain === 'TN antar Outlet' && (
                        <div style={{ marginBottom: '12px' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Toko Tujuan Transfer</label><input type="text" className="input-field" value={actionDetails.tokoTujuan || ''} onChange={e => setActionDetails({ ...actionDetails, tokoTujuan: e.target.value })} style={{ width: '100%' }} placeholder="Contoh: Apotek Alpro Pontianak" /></div>
                    )}
                    {actionMain === 'Retur' && (
                        <div style={{ marginBottom: '12px' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Lokasi/Entitas Retur</label><input type="text" className="input-field" value={actionDetails.returKe || ''} onChange={e => setActionDetails({ ...actionDetails, returKe: e.target.value })} style={{ width: '100%' }} placeholder="Contoh: Gudang Pusat" /></div>
                    )}
                    {actionMain === 'Tukar Guling' && (
                        <div style={{ marginBottom: '12px' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mekanisme Tukar Guling</label><textarea className="input-field" value={actionDetails.mekanisme || ''} onChange={e => setActionDetails({ ...actionDetails, mekanisme: e.target.value })} style={{ width: '100%', minHeight: '60px' }} placeholder="Tulis rincian penukaran dengan supplier..."></textarea></div>
                    )}
                    {actionMain === 'Write Off' && (
                        <div style={{ marginBottom: '12px' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ketentuan / Alasan Penghangusan</label><textarea className="input-field" value={actionDetails.ketentuan || ''} onChange={e => setActionDetails({ ...actionDetails, ketentuan: e.target.value })} style={{ width: '100%', minHeight: '60px' }}></textarea></div>
                    )}
                    {actionMain === 'Other' && (
                        <div style={{ marginBottom: '12px' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Deskripsi Keperluan Opsional</label><textarea className="input-field" value={actionDetails.deskripsi || ''} onChange={e => setActionDetails({ ...actionDetails, deskripsi: e.target.value })} style={{ width: '100%', minHeight: '60px' }}></textarea></div>
                    )}

                    {['Reduce To Clear', 'TN antar Outlet', 'Retur', 'Tukar Guling'].includes(actionMain) && (
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Periode Pelaksanaan Awal</label><input type="date" className="input-field" value={actionDetails.periodeAwal || ''} onChange={e => setActionDetails({ ...actionDetails, periodeAwal: e.target.value })} style={{ width: '100%' }} /></div>
                            <div style={{ flex: 1 }}><label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Batas Pelaksanaan</label><input type="date" className="input-field" value={actionDetails.periodeAkhir || ''} onChange={e => setActionDetails({ ...actionDetails, periodeAkhir: e.target.value })} style={{ width: '100%' }} /></div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                        <button className="btn btn-outline" onClick={() => setIsActionModalOpen(false)} disabled={isSubmittingAction}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSubmitAksi} disabled={!actionMain || isSubmittingAction || selectedRows.length === 0} style={{ gap: '8px' }}>
                            {isSubmittingAction ? <Loader2 className="spinner" size={16} /> : <CheckSquare size={16} />} Jalankan Perintah
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <DashboardSkeleton kpiCount={0} chartHeight={0} />;

    return (
        <>
            {renderActionModal()}

            {/* ── Toast Notification ── */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
                    background: toast.type === 'error' ? 'var(--danger)' : '#10b981',
                    color: 'white', padding: '12px 20px', borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)', fontSize: '0.9rem', fontWeight: 600,
                    animation: 'fadeIn 0.3s ease', maxWidth: '380px', lineHeight: 1.4
                }}>
                    {toast.message}
                </div>
            )}

            <div className="fade-up">
                <div className={styles.pageHeader}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h2 className={styles.pageTitle}>Data Stok Eksekusi</h2>
                            <p className={styles.pageSubtitle}>Buku besar cek stok dan inisiasi perintah ke outlet.</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', padding: '8px 16px', borderRadius: '50px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Pembulatan Stok Desimal (ke Bawah)</span>
                            <label className={OutletInputStyles.toggleSwitch} style={{ transform: 'scale(0.8)', margin: 0 }}>
                                <input type="checkbox" checked={isRounding} onChange={(e) => setIsRounding(e.target.checked)} />
                                <span className={OutletInputStyles.toggleSlider}></span>
                            </label>
                        </div>
                    </div>
                </div>

                {error && <div className={OutletInputStyles.alert} style={{ marginBottom: '20px' }}><span>{error}</span></div>}

                <div className={styles.section} style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        <SlidersHorizontal size={18} /> Filter Data Global
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Procurement ID</label>
                            <select className="input-field" style={{ fontSize: '0.85rem' }} value={selectedProcId} onChange={e => setSelectedProcId(e.target.value)}>
                                <option value="">-- Semua ID --</option>
                                {filterOptions.procIds.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Supplier</label>
                            <select className="input-field" style={{ fontSize: '0.85rem' }} value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                                <option value="">-- Semua Supplier --</option>
                                {filterOptions.suppliers.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pencarian Produk</label>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', top: '10px', left: '10px', color: 'var(--text-muted)' }} />
                                <input type="text" className="input-field" placeholder="Ketik..." style={{ paddingLeft: '32px', fontSize: '0.85rem' }} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Apotek (Outlet)</label>
                            <select className="input-field" style={{ fontSize: '0.85rem' }} value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}>
                                <option value="">-- Semua Apotek --</option>
                                {filterOptions.outlets.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Jarak ED</label>
                            <select className="input-field" style={{ fontSize: '0.85rem' }} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                                <option value="">-- Semua Kategori --</option>
                                {CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Tabel Mutasi Produk Short ED</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Menampilkan {paginatedData.length} dari {aggregatedData.length} baris (Hal {currentPage}/{totalPages})
                            </span>
                            {selectedRows.length > 0 && (
                                <button className="btn btn-primary" onClick={() => setIsActionModalOpen(true)} style={{ height: '32px', padding: '0 16px', fontSize: '0.8rem', gap: '8px', borderRadius: 'var(--radius-sm)' }}>
                                    <CheckSquare size={14} /> Eksekusi {selectedRows.length} Produk
                                </button>
                            )}

                            {/* ── Export Dropdown ── */}
                            <div ref={exportDropdownRef} style={{ position: 'relative' }}>
                                <button
                                    className="btn"
                                    onClick={() => setExportDropdownOpen(prev => !prev)}
                                    disabled={isExportingDetail || isExportingRekap || aggregatedData.length === 0}
                                    style={{ height: '32px', padding: '0 14px', fontSize: '0.78rem', gap: '6px', color: 'var(--text-sub)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                                >
                                    <FileDown size={14} />
                                    Ekspor CSV
                                    <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: exportDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                                </button>

                                {exportDropdownOpen && (
                                    <div style={{
                                        position: 'absolute', top: '36px', right: 0, background: 'var(--surface)',
                                        border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                        minWidth: '200px', zIndex: 500, overflow: 'hidden', animation: 'fadeIn 0.15s ease'
                                    }}>
                                        <button
                                            onClick={handleExportDetail}
                                            disabled={isExportingDetail}
                                            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                                        >
                                            {isExportingDetail
                                                ? <><Loader2 size={14} className="spinner" /> Menyiapkan data...</>
                                                : <><FileDown size={14} color="var(--primary)" /> <span><strong>Export Detail</strong><br /><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Semua baris stok mentah</span></span></>}
                                        </button>
                                        <button
                                            onClick={handleExportRekap}
                                            disabled={isExportingRekap}
                                            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                                        >
                                            {isExportingRekap
                                                ? <><Loader2 size={14} className="spinner" /> Menyiapkan data...</>
                                                : <><FileDown size={14} color="var(--blue)" /> <span><strong>Export Rekap</strong><br /><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Digroup per kode produk</span></span></>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {aggregatedData.length === 0 ? (
                        <div className={OutletInputStyles.emptyState} style={{ padding: '60px 0' }}><PackageSearch size={48} color="var(--border-strong)" /><p className={OutletInputStyles.emptyTitle}>Data Tidak Ditemukan</p></div>
                    ) : (
                        <div className={OutletInputStyles.tableContainer}>
                            <table className={OutletInputStyles.table} style={{ whiteSpace: 'normal' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px', textAlign: 'center' }}>
                                            <input type="checkbox" onChange={handleSelectAll} checked={selectedRows.length === paginatedData.length && paginatedData.length > 0} style={{ transform: 'scale(1.2)' }} />
                                        </th>
                                        <th style={{ width: '25%', minWidth: '250px' }}>Supplier & Produk</th>
                                        <th style={{ width: '20%', minWidth: '180px' }}>Detail</th>
                                        <th style={{ width: '15%', minWidth: '150px' }}>Finansial</th>
                                        <th style={{ width: '25%', minWidth: '200px' }}>Aksi Procurement (Status)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.map(group => {
                                        const catInfo = CATEGORIES.find(c => c.key === group.primaryCategory) || CATEGORIES[CATEGORIES.length - 1];
                                        const isSelected = selectedRows.some(r => r.id === group.id);

                                        return (
                                            <tr key={group.id} style={{ background: isSelected ? 'var(--blue-light)' : 'transparent', transition: 'background 0.2s' }}>
                                                <td style={{ verticalAlign: 'top', paddingTop: '16px', textAlign: 'center' }}>
                                                    <input type="checkbox" checked={isSelected} onChange={(e) => handleSelectRow(group, e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                                                </td>
                                                <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '0.9rem' }}>{group.supplierInfo}</div>
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>{group.itemName}</div>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{group.product_code}</div>
                                                </td>
                                                <td style={{ verticalAlign: 'top', paddingTop: '16px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                                                    <div><strong>Kategori:</strong> <span className={OutletInputStyles[catInfo.badge]} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-block', marginLeft: '4px' }}>{catInfo.label}</span></div>
                                                    <div><strong>ED Terdekat:</strong> {formatDate(group.earliestDate)}</div>
                                                    <div><strong>Jumlah Batch:</strong> {group.batches.size}</div>
                                                    <div><strong>Sisa Stok:</strong> <span style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>{group.totalQty}</span></div>
                                                    <div><strong>Jml Apotek:</strong> {group.outlets.size}</div>
                                                </td>
                                                <td style={{ verticalAlign: 'top', paddingTop: '16px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                                                    <div><strong>Cost/Unit:</strong> {formatCurrency(group.unitCost)}</div>
                                                </td>
                                                <td style={{ verticalAlign: 'top', paddingTop: '16px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.6', wordBreak: 'break-word' }}>
                                                    {group.rekomendasi ? (
                                                        <span style={{ color: 'var(--primary-dark)', fontWeight: 600, background: 'var(--blue-light)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>{group.rekomendasi}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>- Belum Ada Aksi -</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && aggregatedData.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 8px' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Halaman {currentPage} dari {totalPages}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-outline" style={{ height: '32px', padding: '0 12px', fontSize: '0.85rem' }} disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Sebelumnya</button>
                                <button className="btn btn-outline" style={{ height: '32px', padding: '0 12px', fontSize: '0.85rem' }} disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Selanjutnya</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
