/**
 * SalesMonitoringPage.jsx — Monitoring & Rekap Penjualan Produk Short ED (Multi-Outlet)
 * Digunakan oleh role Area Manager (AM) dan BOD / Manajemen.
 * Desain UI/UX Modern, Bersih, dan Responsif Mobile-First (Design System Apotek Alpro).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Receipt, Calendar, Building2, TrendingUp,
    ShoppingBag, Download, RefreshCw, Search, X, Loader2
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchAMOutlets } from '../services/amService';
import { fetchAMSales, fetchAllSales, exportSalesToExcel } from '../services/salesService';
import styles from './OutletSalesPage.module.css';

function fmtRp(val) {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCurrentMonthString() {
    return new Date().toISOString().slice(0, 7);
}

export default function SalesMonitoringPage({ role = 'AM' }) {
    const user = useAuthStore(s => s.user);
    const isBOD = role === 'BOD' || user?.role === 'BOD' || user?.role === 'PROCUREMENT';

    // State Data
    const [outlets, setOutlets] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [selectedOutlet, setSelectedOutlet] = useState('ALL');
    const [selectedAM, setSelectedAM] = useState('ALL'); // For BOD
    const [periodFilter, setPeriodFilter] = useState('CURRENT_MONTH');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [tableSearch, setTableSearch] = useState('');

    // 1. Fetch Outlets & Sales
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let filterObj = {};
            const currentMonth = getCurrentMonthString();
            if (periodFilter === 'CURRENT_MONTH') {
                filterObj.period = currentMonth;
            } else if (periodFilter === 'LAST_MONTH') {
                const d = new Date();
                d.setMonth(d.getMonth() - 1);
                filterObj.period = d.toISOString().slice(0, 7);
            } else if (periodFilter === 'CUSTOM') {
                if (customStartDate) filterObj.startDate = customStartDate;
                if (customEndDate) filterObj.endDate = customEndDate;
            }

            if (isBOD) {
                const allData = await fetchAllSales(filterObj);
                setSales(allData);
            } else {
                // AM Mode
                const amOutlets = await fetchAMOutlets(user?.name);
                setOutlets(amOutlets);

                if (amOutlets && amOutlets.length > 0) {
                    const codes = amOutlets.map(o => o.outlet_code);
                    const amSalesData = await fetchAMSales(codes, filterObj);
                    setSales(amSalesData);
                } else {
                    setSales([]);
                }
            }
        } catch (err) {
            console.error('Error load sales:', err);
            setError('Gagal memuat data penjualan: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [isBOD, user?.name, periodFilter, customStartDate, customEndDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Unique AMs list for BOD filter
    const amList = useMemo(() => {
        if (!isBOD) return [];
        const set = new Set();
        sales.forEach(s => {
            if (s.am_name && s.am_name !== '—') set.add(s.am_name);
        });
        return Array.from(set).sort();
    }, [isBOD, sales]);

    // Unique Outlets list for dropdown
    const outletList = useMemo(() => {
        if (!isBOD) return outlets;
        const map = {};
        sales.forEach(s => {
            if (s.outlet_code && !map[s.outlet_code]) {
                map[s.outlet_code] = {
                    outlet_code: s.outlet_code,
                    outlet_name: s.outlet_name || s.outlet_code,
                    am_name: s.am_name
                };
            }
        });
        return Object.values(map).sort((a, b) => a.outlet_name.localeCompare(b.outlet_name));
    }, [isBOD, outlets, sales]);

    // Filtered Sales based on user UI controls
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            if (isBOD && selectedAM !== 'ALL' && s.am_name !== selectedAM) return false;
            if (selectedOutlet !== 'ALL' && s.outlet_code !== selectedOutlet) return false;

            if (tableSearch.trim()) {
                const q = tableSearch.trim().toLowerCase();
                const name = (s.master_products?.item_description || '').toLowerCase();
                const code = (s.product_code || '').toLowerCase();
                const receipt = (s.receipt_number || '').toLowerCase();
                const batch = (s.batch_id || '').toLowerCase();
                const outletName = (s.outlet_name || '').toLowerCase();
                const outletCode = (s.outlet_code || '').toLowerCase();

                const match = name.includes(q) || code.includes(q) || receipt.includes(q) ||
                    batch.includes(q) || outletName.includes(q) || outletCode.includes(q);
                if (!match) return false;
            }

            return true;
        });
    }, [sales, isBOD, selectedAM, selectedOutlet, tableSearch]);

    // KPI Metrics
    const { totalItemsSold, totalRevenue, totalReceiptsCount, activeOutletsCount } = useMemo(() => {
        let itemsCount = 0;
        let revenue = 0;
        const receiptsSet = new Set();
        const outletsSet = new Set();

        filteredSales.forEach(s => {
            const q = parseFloat(s.qty) || 0;
            const p = parseFloat(s.total_price) || (q * (parseFloat(s.unit_price) || 0));
            itemsCount += q;
            revenue += p;
            if (s.receipt_number) receiptsSet.add(s.receipt_number);
            if (s.outlet_code) outletsSet.add(s.outlet_code);
        });

        return {
            totalItemsSold: itemsCount,
            totalRevenue: revenue,
            totalReceiptsCount: receiptsSet.size,
            activeOutletsCount: outletsSet.size
        };
    }, [filteredSales]);

    // Download Excel Handler
    const handleDownloadExcel = () => {
        if (!filteredSales || filteredSales.length === 0) {
            alert('Tidak ada data penjualan untuk diunduh.');
            return;
        }
        const title = isBOD
            ? 'Rekap_Penjualan_Short_ED_Nasional'
            : `Rekap_Penjualan_Short_ED_Area_${user?.name || 'AM'}`;

        exportSalesToExcel(filteredSales, {
            fileName: title,
            isMultiOutlet: true
        });
    };

    return (
        <div className="fade-up">
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>
                        {isBOD ? 'Rekap Penjualan Short ED (Nasional)' : 'Rekap Penjualan Short ED (Area)'}
                    </h2>
                    <p className={styles.pageSubtitle}>
                        {isBOD
                            ? 'Konsolidasi data realisasi penjualan produk mendekati kedaluwarsa seluruh apotek'
                            : `Area Manager: ${user?.name || '—'} · Realisasi penjualan produk short ED di apotek area Anda`}
                    </p>
                </div>

                <button
                    onClick={loadData}
                    disabled={loading}
                    className={styles.btnRefresh}
                >
                    <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
                    Segarkan Data
                </button>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Terjual</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconBlue}`}><ShoppingBag size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : totalItemsSold}</div>
                    <div className={styles.kpiMeta}>Pcs / Box terealisasi</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Omzet Penjualan</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconGreen}`}><TrendingUp size={16} /></div>
                    </div>
                    <div className={styles.kpiValue} style={{ color: 'var(--success)' }}>
                        {loading ? '…' : fmtRp(totalRevenue)}
                    </div>
                    <div className={styles.kpiMeta}>Nilai penjualan diselamatkan</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Struk Kasir</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconAmber}`}><Receipt size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : totalReceiptsCount}</div>
                    <div className={styles.kpiMeta}>Nomor transaksi tercatat</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Apotek Aktif Jual</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconBlue}`}><Building2 size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : `${activeOutletsCount} Apotek`}</div>
                    <div className={styles.kpiMeta}>Telah melaporkan penjualan</div>
                </div>
            </div>

            {/* Table Section */}
            <div className={styles.tableSection}>
                <div className={styles.tableToolbar}>
                    <div>
                        <div className={styles.tableTitle}>Tabel Detail Penjualan Short ED</div>
                        <div className={styles.tableSubtitle}>
                            {filteredSales.length} transaksi ditampilkan
                        </div>
                    </div>

                    {/* Controls */}
                    <div className={styles.toolbarControls}>
                        {/* BOD: Filter Area Manager */}
                        {isBOD && amList.length > 0 && (
                            <select
                                value={selectedAM}
                                onChange={e => { setSelectedAM(e.target.value); setSelectedOutlet('ALL'); }}
                                className={styles.toolbarSelect}
                            >
                                <option value="ALL">Semua Area Manager</option>
                                {amList.map(am => (
                                    <option key={am} value={am}>{am}</option>
                                ))}
                            </select>
                        )}

                        {/* Filter Outlet */}
                        <select
                            value={selectedOutlet}
                            onChange={e => setSelectedOutlet(e.target.value)}
                            className={styles.toolbarSelect}
                            style={{ maxWidth: '200px' }}
                        >
                            <option value="ALL">Semua Apotek</option>
                            {outletList.map(o => (
                                <option key={o.outlet_code} value={o.outlet_code}>
                                    {o.outlet_name} ({o.outlet_code})
                                </option>
                            ))}
                        </select>

                        {/* Filter Periode */}
                        <select
                            value={periodFilter}
                            onChange={e => setPeriodFilter(e.target.value)}
                            className={styles.toolbarSelect}
                        >
                            <option value="CURRENT_MONTH">Bulan Berjalan ({getCurrentMonthString()})</option>
                            <option value="LAST_MONTH">Bulan Lalu</option>
                            <option value="ALL">Semua Periode</option>
                            <option value="CUSTOM">Rentang Tanggal Khusus</option>
                        </select>

                        {/* Custom Date Range */}
                        {periodFilter === 'CUSTOM' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={e => setCustomStartDate(e.target.value)}
                                    className={styles.toolbarSelect}
                                    style={{ padding: '0 8px' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>s/d</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={e => setCustomEndDate(e.target.value)}
                                    className={styles.toolbarSelect}
                                    style={{ padding: '0 8px' }}
                                />
                            </div>
                        )}

                        {/* Search Input */}
                        <div className={styles.toolbarSearch}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Cari apotek, obat, struk..."
                                value={tableSearch}
                                onChange={e => setTableSearch(e.target.value)}
                                className={styles.toolbarSearchInput}
                            />
                            {tableSearch && (
                                <button
                                    onClick={() => setTableSearch('')}
                                    style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Unduh Excel */}
                        <button
                            onClick={handleDownloadExcel}
                            disabled={loading || filteredSales.length === 0}
                            className={styles.btnDownload}
                        >
                            <Download size={15} />
                            Unduh Excel (.xlsx)
                        </button>
                    </div>
                </div>

                {/* Table Body */}
                <div className={styles.tableWrap}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', color: 'var(--primary)' }} />
                            <div>Memuat data penjualan...</div>
                        </div>
                    ) : error ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
                            {error}
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Tidak ada data penjualan pada filter periode yang dipilih.
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nama Apotek</th>
                                    <th>Tanggal Transaksi</th>
                                    <th>Nomor Struk</th>
                                    <th>Kode Produk</th>
                                    <th>Nama Produk</th>
                                    <th>Nomor Batch</th>
                                    <th>Tanggal ED</th>
                                    <th style={{ textAlign: 'right' }}>Qty Terjual</th>
                                    <th style={{ textAlign: 'right' }}>Harga Satuan</th>
                                    <th style={{ textAlign: 'right' }}>Total Penjualan</th>
                                    <th style={{ textAlign: 'center' }}>Waktu Input</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSales.map((s, idx) => (
                                    <tr key={s.id || idx}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                {s.outlet_name || s.outlet_code}
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                <code>{s.outlet_code}</code> {s.am_name && s.am_name !== '—' ? `· AM: ${s.am_name}` : ''}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{formatDate(s.transaction_date)}</td>
                                        <td>
                                            <span className={styles.receiptBadge}>{s.receipt_number}</span>
                                        </td>
                                        <td><code className={styles.codeBadge}>{s.product_code}</code></td>
                                        <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                            {s.master_products?.item_description || '(Tidak diketahui)'}
                                        </td>
                                        <td style={{ fontFamily: 'monospace' }}>{s.batch_id}</td>
                                        <td>{formatDate(s.ed_date)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                                            {s.qty}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{fmtRp(s.unit_price)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>
                                            {fmtRp(s.total_price || (s.qty * s.unit_price))}
                                        </td>
                                        <td style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            {s.created_at ? new Date(s.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className={styles.tableFooterRow}>
                                    <td colSpan={7} style={{ textAlign: 'right' }}>
                                        GRAND TOTAL PENJUALAN:
                                    </td>
                                    <td style={{ textAlign: 'right', color: 'var(--primary)', fontSize: '0.95rem' }}>
                                        {totalItemsSold}
                                    </td>
                                    <td></td>
                                    <td style={{ textAlign: 'right', color: 'var(--success)', fontSize: '0.95rem' }}>
                                        {fmtRp(totalRevenue)}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
