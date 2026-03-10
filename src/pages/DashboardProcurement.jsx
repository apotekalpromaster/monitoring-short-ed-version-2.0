import { useState, useEffect, useMemo } from 'react';
import { PackageSearch, Search, SlidersHorizontal, Loader2, Inbox, FileDown, TableProperties, BarChart3, TrendingDown, CheckSquare, X } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchAllProcurementStocks } from '../services/procurementService';
import { supabase } from '../services/supabaseClient';
import { getEdCategory, formatDate, CATEGORIES } from '../utils/edHelpers';
import styles from './Dashboard.module.css';
import OutletInputStyles from './OutletInputPage.module.css';

const formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatShortNum = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n;

export default function DashboardProcurement() {
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

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    // Multi-Selection State
    const [selectedRows, setSelectedRows] = useState([]);

    // Modal State
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [actionMain, setActionMain] = useState('');
    const [actionDetails, setActionDetails] = useState({});
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);

    // Hover States for SVG Tooltips
    const [hoveredPie, setHoveredPie] = useState(null);
    const [hoveredCombo, setHoveredCombo] = useState(null);
    const [hoveredBar, setHoveredBar] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        setError('');
        try {
            const data = await fetchAllProcurementStocks();
            setStocks(data);
        } catch (err) {
            setError('Gagal memuat data Procurement: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    // Ekstrak Opsi Filter
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

    // Aplikasikan Filter & Pembulatan
    const filteredData = useMemo(() => {
        return stocks.reduce((acc, item) => {
            if (selectedCategory && getEdCategory(item.ed_date) !== selectedCategory) return acc;
            if (selectedOutlet && item.outlet_name !== selectedOutlet) return acc;
            const vendor = item.master_products?.supplier || item.master_products?.supplier_name;
            if (selectedSupplier && vendor !== selectedSupplier) return acc;
            if (selectedProcId && item.master_products?.procurement_id !== selectedProcId) return acc;

            // 1. Sesuai request, filter out item yang sudah ditarik (terkumpul) dari tabel Procurement
            if (getEdCategory(item.ed_date) === 'terkumpul') return acc;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const code = (item.product_code || '').toLowerCase();
                const name = (item.master_products?.item_description || '').toLowerCase();
                if (!code.includes(q) && !name.includes(q)) return acc;
            }

            // Opsi Pembulatan (misal qty desimal 0.9 -> 0, dihilangkan dari tabel logis)
            const rawQty = parseFloat(item.qty) || 0;
            const displayQty = isRounding ? Math.floor(rawQty) : rawQty;

            if (displayQty > 0) {
                acc.push({ ...item, qty: displayQty });
            }
            return acc;
        }, []);
    }, [stocks, searchQuery, selectedOutlet, selectedCategory, selectedSupplier, selectedProcId, isRounding]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedOutlet, selectedCategory, selectedSupplier, selectedProcId, isRounding]);

    // ----------------------------------------------------
    // AGREGASI DATA PROCUREMENT (GROUP BY BARCODE)
    // ----------------------------------------------------
    const aggregatedData = useMemo(() => {
        const grouped = {};
        filteredData.forEach(item => {
            const pCode = item.product_code;
            if (!grouped[pCode]) {
                grouped[pCode] = {
                    id: pCode, // use product code as unique table row id
                    product_code: pCode,
                    itemName: item.master_products?.item_description || 'Unknown Item',
                    supplierInfo: `${item.master_products?.procurement_id || '-'} - ${item.master_products?.supplier || item.master_products?.supplier_name || 'Tanpa Supplier'}`,
                    categories: new Set(),
                    earliestDate: item.ed_date,
                    batches: new Set(),
                    totalQty: 0,
                    outlets: new Set(),
                    // Prioritize unit_cost_with_vat as requested by user
                    unitCost: Number(item.master_products?.unit_cost_with_vat) || 0,
                    status_action: item.status_action || ''
                };
            }
            const g = grouped[pCode];
            g.categories.add(getEdCategory(item.ed_date));
            if (item.ed_date < g.earliestDate) g.earliestDate = item.ed_date;
            if (item.batch_id) g.batches.add(item.batch_id);
            g.totalQty += item.qty;
            g.outlets.add(item.outlet_code);
            if (item.status_action) g.status_action = item.status_action;
        });

        return Object.values(grouped).map(g => {
            let qty = g.totalQty;
            if (isRounding) qty = Math.floor(qty);
            return {
                ...g,
                totalQty: qty,
                totalCost: qty * g.unitCost,
                // Highest priority category
                primaryCategory: Array.from(g.categories).sort((a, b) => {
                    const order = ['terkumpul', 'bulanIni', '1to3', '4to6', '7to12', 'other'];
                    return order.indexOf(a) - order.indexOf(b);
                })[0] || 'other'
            };
        }).sort((a, b) => b.totalCost - a.totalCost); // sort by total cost descending by default
    }, [filteredData, isRounding]);

    const totalPages = Math.max(1, Math.ceil(aggregatedData.length / itemsPerPage));
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return aggregatedData.slice(startIndex, startIndex + itemsPerPage);
    }, [aggregatedData, currentPage, itemsPerPage]);

    // ----------------------------------------------------
    // PERHITUNGAN VISUALISASI CHART & TABEL RINGKASAN
    // ----------------------------------------------------
    const { statusSummary, topSuppliers, top10Products, categoryRisk } = useMemo(() => {
        const _status = {};
        const _supplier = {};
        const _products = {};
        const _cat = {
            'bulanIni': { label: 'Bulan Ini', cost: 0, skus: new Set() },
            '1to3': { label: '1-3 Bulan', cost: 0, skus: new Set() },
            '4to6': { label: '4-6 Bulan', cost: 0, skus: new Set() },
            '7to12': { label: '7-12 Bulan', cost: 0, skus: new Set() }
        };

        filteredData.forEach(item => {
            const cat = getEdCategory(item.ed_date);
            // Use unit_cost_with_vat
            const price = Number(item.master_products?.unit_cost_with_vat) || 0;
            const cost = item.qty * price;

            // 1. Status Summary
            const statName = item.status_action || 'Belum Ditindak';
            if (!_status[statName]) _status[statName] = { cost: 0, skus: new Set() };
            _status[statName].cost += cost;
            _status[statName].skus.add(item.product_code);

            // Risiko = Bukan Terkumpul & Bukan >12 Bln
            if (cat !== 'terkumpul' && cat !== 'other') {
                // 2. Top Supplier
                const supName = item.master_products?.supplier || item.master_products?.supplier_name || 'Tanpa Supplier';
                if (!_supplier[supName]) _supplier[supName] = 0;
                _supplier[supName] += cost;

                // 3. Top Products
                const pCode = item.product_code;
                const pName = item.master_products?.item_description || pCode;
                if (!_products[pCode]) _products[pCode] = { name: pName, cost: 0, outlets: new Set() };
                _products[pCode].cost += cost;
                _products[pCode].outlets.add(item.outlet_code);

                // 4. Category Bar
                if (_cat[cat]) {
                    _cat[cat].cost += cost;
                    _cat[cat].skus.add(item.product_code);
                }
            }
        });

        // Sorting
        const tSuppliers = Object.entries(_supplier)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, value]) => ({ id: name, label: name, value }));

        const totalSupRisk = tSuppliers.reduce((sum, s) => sum + s.value, 0);
        tSuppliers.forEach(s => s.percent = totalSupRisk > 0 ? (s.value / totalSupRisk) * 100 : 0);

        const tProducts = Object.values(_products)
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10);

        return {
            statusSummary: _status,
            topSuppliers: tSuppliers,
            totalSupRisk,
            top10Products: tProducts,
            categoryRisk: Object.values(_cat)
        };
    }, [filteredData]);

    // ---- RENDER PIE CHART SVG ----
    const renderSupplierPie = () => {
        if (topSuppliers.length === 0) return <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Tidak ada risiko supplier</div>;

        const colors = ['#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
        let currentOffset = 0;
        const radius = 15.915494309189533;

        return (
            <div style={{ position: 'relative', display: 'flex', gap: '24px', alignItems: 'center' }} onMouseLeave={() => setHoveredPie(null)}>
                <svg viewBox="0 0 42 42" style={{ width: '160px', height: '160px', transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    <circle cx="21" cy="21" r={radius} fill="transparent" stroke="var(--surface)" strokeWidth="6" />
                    {topSuppliers.map((slice, idx) => {
                        const sliceOffset = -currentOffset;
                        currentOffset += slice.percent;
                        const isHovered = hoveredPie?.id === slice.id;
                        const color = colors[idx % colors.length];

                        return (
                            <circle
                                key={slice.id} cx="21" cy="21" r={radius} fill="transparent"
                                stroke={color}
                                strokeWidth={isHovered ? "8" : "6"}
                                strokeDasharray={`${slice.percent} ${100 - slice.percent}`}
                                strokeDashoffset={sliceOffset}
                                style={{ transition: 'stroke-width 0.2s', cursor: 'pointer', outline: 'none' }}
                                onMouseEnter={() => setHoveredPie({ ...slice, color })}
                            />
                        );
                    })}
                </svg>

                {hoveredPie && (
                    <div style={{
                        position: 'absolute', top: '10%', left: '30%', background: 'var(--surface)', border: '1px solid var(--border)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', padding: '12px', borderRadius: '8px', zIndex: 10, pointerEvents: 'none',
                        minWidth: '180px', animation: 'fadeIn 0.2s ease-out'
                    }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{hoveredPie.label}</div>
                        <div style={{ fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 700, margin: '4px 0' }}>{formatCurrency(hoveredPie.value)}</div>
                        <div style={{ fontSize: '0.9rem', color: hoveredPie.color, fontWeight: 700 }}>({hoveredPie.percent.toFixed(1)}%)</div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', maxWidth: '200px' }}>
                    {topSuppliers.map((s, idx) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', opacity: hoveredPie && hoveredPie.id !== s.id ? 0.3 : 1, transition: '0.2s' }}>
                            <span style={{ width: 12, height: 12, borderRadius: 2, background: colors[idx % colors.length], flexShrink: 0, marginTop: 3 }} />
                            <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ---- RENDER COMBO CHART SVG ----
    const renderComboChart = () => {
        if (top10Products.length === 0) return <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Kosong</div>;

        const maxCost = Math.max(...top10Products.map(p => p.cost), 1);
        const maxOutlets = Math.max(...top10Products.map(p => p.outlets.size), 1) * 1.2; // 20% headroom

        const w = 800, h = 320, padTop = 20, padBtm = 100, padLeft = 70, padRight = 60;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBtm;
        const stepX = chartW / top10Products.length;

        // Points for Polyline
        const linePoints = top10Products.map((p, i) => {
            const x = padLeft + (i * stepX) + (stepX / 2);
            const y = padTop + chartH - ((p.outlets.size / maxOutlets) * chartH);
            return `${x},${y}`;
        }).join(' ');

        return (
            <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }} onMouseLeave={() => setHoveredCombo(null)}>
                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: '700px', height: '100%', display: 'block', overflow: 'visible' }}>
                    {/* Grid & Axis Y Left (Cost) */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const y = padTop + chartH - (chartH * pct);
                        return (
                            <g key={pct}>
                                <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 4" />
                                <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--primary)">{formatShortNum(maxCost * pct)}</text>
                            </g>
                        );
                    })}
                    <text x={20} y={h / 2} transform={`rotate(-90 20 ${h / 2})`} textAnchor="middle" fontSize="13" fontWeight="bold" fill="var(--primary)">Total Biaya</text>

                    {/* Axis Y Right (Outlets) */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const y = padTop + chartH - (chartH * pct);
                        return <text key={'r' + pct} x={w - padRight + 10} y={y + 4} textAnchor="start" fontSize="12" fill="var(--danger)">{(maxOutlets * pct).toFixed(0)}</text>;
                    })}
                    <text x={w - 20} y={h / 2} transform={`rotate(-90 ${w - 20} ${h / 2})`} textAnchor="middle" fontSize="13" fontWeight="bold" fill="var(--danger)">Jumlah Apotek</text>

                    {/* Bars & Interactive Triggers */}
                    {top10Products.map((p, i) => {
                        const barH = (p.cost / maxCost) * chartH;
                        const x = padLeft + (i * stepX) + (stepX * 0.15);
                        const y = padTop + chartH - barH;
                        const textName = p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name;

                        return (
                            <g key={i} onMouseEnter={(e) => {
                                const rect = e.target.getBoundingClientRect();
                                setHoveredCombo({ p, cx: padLeft + (i * stepX) + (stepX / 2), cy: y - 20 });
                            }}>
                                <rect x={x} y={y} width={stepX * 0.7} height={barH} fill="var(--primary)" style={{ cursor: 'pointer', transition: 'opacity 0.2s', opacity: hoveredCombo && hoveredCombo.p.name !== p.name ? 0.3 : 1 }} />
                                {/* Label Sumbu X miring */}
                                <text x={x + (stepX * 0.35)} y={padTop + chartH + 15} textAnchor="end" transform={`rotate(-40 ${x + (stepX * 0.35)} ${padTop + chartH + 15})`} fontSize="11" fill="var(--text-secondary)">{textName}</text>
                                {/* Invisible Hover Catcher Box */}
                                <rect x={padLeft + (i * stepX)} y={padTop} width={stepX} height={chartH + padBtm} fill="transparent" />
                            </g>
                        );
                    })}

                    {/* Line Chart Polyline */}
                    <polyline points={linePoints} fill="none" stroke="var(--danger)" strokeWidth="2.5" pointerEvents="none" />
                    {top10Products.map((p, i) => {
                        const cx = padLeft + (i * stepX) + (stepX / 2);
                        const cy = padTop + chartH - ((p.outlets.size / maxOutlets) * chartH);
                        return <circle key={'c' + i} cx={cx} cy={cy} r="4" fill="var(--background)" stroke="var(--danger)" strokeWidth="2" pointerEvents="none" />;
                    })}
                </svg>

                {/* Combobox Tooltip Float */}
                {hoveredCombo && (
                    <div style={{
                        position: 'absolute', top: hoveredCombo.cy, left: hoveredCombo.cx, transform: 'translate(-50%, -100%)',
                        background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        padding: '10px 14px', borderRadius: '6px', zIndex: 20, pointerEvents: 'none', backgroundClip: 'padding-box', minWidth: '220px'
                    }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '8px' }}>{hoveredCombo.p.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Biaya: <strong style={{ color: 'var(--primary-dark)' }}>{formatCurrency(hoveredCombo.p.cost)}</strong></div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Jumlah Apotek: <strong style={{ color: 'var(--danger)' }}>{hoveredCombo.p.outlets.size} Outlet</strong></div>
                    </div>
                )}
            </div>
        );
    };

    // ---- RENDER BAR CHART KATEGORI ----
    const renderCategoryBar = () => {
        const maxCost = Math.max(...categoryRisk.map(c => c.cost), 1);
        const w = 700, h = 280, padTop = 30, padBtm = 60, padLeft = 80, padRight = 30;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBtm;
        const stepX = chartW / categoryRisk.length;

        return (
            <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }} onMouseLeave={() => setHoveredBar(null)}>
                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: '600px', height: '100%', display: 'block' }}>
                    {/* Grid Y */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const y = padTop + chartH - (chartH * pct);
                        return (
                            <g key={pct}>
                                <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="var(--border-strong)" strokeWidth="1" />
                                <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">{formatShortNum(maxCost * pct)}</text>
                            </g>
                        );
                    })}
                    <text x={20} y={h / 2} transform={`rotate(-90 20 ${h / 2})`} textAnchor="middle" fontSize="13" fill="var(--text-primary)">Total Biaya (Rp)</text>
                    <text x={padLeft + chartW / 2} y={h - 15} textAnchor="middle" fontSize="13" fill="var(--text-primary)">Kategori Kedaluwarsa</text>

                    {/* Bars */}
                    {categoryRisk.map((c, i) => {
                        const barH = (c.cost / maxCost) * chartH;
                        const x = padLeft + (i * stepX) + (stepX * 0.2);
                        const y = padTop + chartH - barH;

                        return (
                            <g key={i} onMouseEnter={() => setHoveredBar({ c, cx: x + (stepX * 0.3), cy: y - 10 })}>
                                <rect x={x} y={y} width={stepX * 0.6} height={barH} fill="var(--blue)" className={styles.svgRect} style={{ transition: 'opacity 0.2s', opacity: hoveredBar && hoveredBar.c.label !== c.label ? 0.5 : 1 }} />
                                <text x={x + (stepX * 0.3)} y={padTop + chartH + 20} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--text-primary)">{c.label}</text>
                                <text x={x + (stepX * 0.3)} y={y + 20} textAnchor="middle" fontSize="12" fill="white" fontWeight="600">{c.skus.size > 0 ? `${c.skus.size} SKU` : ''}</text>
                                {/* Invisible box */}
                                <rect x={padLeft + (i * stepX)} y={padTop} width={stepX} height={chartH + padBtm} fill="transparent" />
                            </g>
                        );
                    })}
                </svg>

                {/* Bar Tooltip Float */}
                {hoveredBar && (
                    <div style={{
                        position: 'absolute', top: hoveredBar.cy, left: hoveredBar.cx, transform: 'translate(-50%, -100%)',
                        background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        padding: '10px 14px', borderRadius: '6px', zIndex: 20, pointerEvents: 'none'
                    }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{hoveredBar.c.label}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Biaya: <strong style={{ color: 'var(--blue)' }}>{formatCurrency(hoveredBar.c.cost)}</strong></div>
                    </div>
                )}
            </div>
        );
    };

    // ----------------------------------------------------
    // PEMROSESAN AKSI MASSAL (MODAL CASCADING)
    // ----------------------------------------------------
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
            // Format stringifikasi turunan field (Sesuai Single Source Truth)
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

            // 2. UPDATE massal ke tabel stocks_ed agar Outlet mendapatkan Pemberitahuan
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
            loadData(); // Rehydrate table
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

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', gap: '16px' }}>
                <Loader2 size={48} className="spinner" color="var(--primary)" />
                <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Mengumpulkan data stok secara utuh...</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Mohon tunggu sebentar, sedang memproses silang dengan Master Produk.</p>
            </div>
        );
    }

    return (
        <>
            {renderActionModal()}
            <div className="fade-up">
                <div className={styles.pageHeader}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h2 className={styles.pageTitle}>Menu Procurement</h2>
                            <p className={styles.pageSubtitle}>Selamat datang, <strong>{user?.name}</strong> — kelola aksi stok Short ED lintas semua outlet.</p>
                        </div>

                        {/* Opsi Pembulatan Toggle */}
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

                {/* Filter Bar */}
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

                {/* BARIS 1: Ringkasan Status & Top 5 Supplier */}
                <div className={styles.twoCol} style={{ marginBottom: '24px' }}>
                    <div className={styles.section} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Ringkasan Status Aksi</span></div>
                        <div className={OutletInputStyles.tableContainer} style={{ flexGrow: 1, padding: '10px' }}>
                            <table className={OutletInputStyles.table}>
                                <thead>
                                    <tr>
                                        <th>Status Aksi</th>
                                        <th style={{ textAlign: 'center' }}>Jumlah SKU</th>
                                        <th style={{ textAlign: 'right' }}>Total Biaya (Cost)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(statusSummary).map(([status, data]) => (
                                        <tr key={status}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{status}</td>
                                            <td style={{ textAlign: 'center', color: 'var(--primary-dark)' }}>{data.skus.size} item</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{formatCurrency(data.cost)}</td>
                                        </tr>
                                    ))}
                                    {Object.keys(statusSummary).length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center' }}>Tidak ada data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Top 5 Supplier Berisiko</span></div>
                        <div style={{ padding: '20px' }}>
                            {renderSupplierPie()}
                        </div>
                    </div>
                </div>

                {/* BARIS 2: Combo Chart */}
                <div className={styles.section} style={{ marginBottom: '24px' }}>
                    <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Analisis Penyebaran Risiko (Top 10 Produk)</span></div>
                    <div style={{ padding: '16px 8px' }}>
                        {renderComboChart()}
                    </div>
                </div>

                {/* BARIS 3: Bar Chart Kategori */}
                <div className={styles.section} style={{ marginBottom: '24px' }}>
                    <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Visualisasi Risiko Produk ED Berdasarkan Total Biaya (Cost)</span></div>
                    <div style={{ padding: '16px 8px' }}>
                        {renderCategoryBar()}
                    </div>
                </div>

                {/* TABEL PROCUREMENT DEFAULT */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Data Stok Short ED — Aksi Procurement</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Menampilkan {paginatedData.length} dari {aggregatedData.length} baris (Hal {currentPage}/{totalPages})
                            </span>
                            {selectedRows.length > 0 && (
                                <button className="btn btn-primary" onClick={() => setIsActionModalOpen(true)} style={{ height: '32px', padding: '0 16px', fontSize: '0.8rem', gap: '8px', borderRadius: 'var(--radius-sm)' }}>
                                    <CheckSquare size={14} /> Eksekusi {selectedRows.length} Produk
                                </button>
                            )}
                            <button className="btn" style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem', gap: '6px', color: 'var(--text-sub)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                                <FileDown size={14} /> Ekspor CSV
                            </button>
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
                                        <th style={{ width: '30%', minWidth: '300px' }}>Supplier & Produk</th>
                                        <th style={{ width: '25%', minWidth: '200px' }}>Detail</th>
                                        <th style={{ width: '25%', minWidth: '200px' }}>Finansial</th>
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
