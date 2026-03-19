import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle, Package, TrendingDown, Activity, Loader2,
    Building2, SlidersHorizontal, Download
} from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LabelList
} from 'recharts';
import useAuthStore from '../store/authStore';
import { fetchAllProcurementStocks } from '../services/procurementService';
import { supabase } from '../services/supabaseClient';
import { getEdCategory, formatDate, CATEGORIES } from '../utils/edHelpers';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import styles from './Dashboard.module.css';
import OutletInputStyles from './OutletInputPage.module.css';

// ── FORMATTERS ──────────────────────────────────────────────────────────────
const fmtRp = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtShort = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' M';   // miliar → M
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' jt';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' rb';
    return String(Math.round(n));
};

// ── PALETTE ──────────────────────────────────────────────────────────────────
const CAT_COLORS = {
    bulanIni: '#ef4444',
    '1to3': '#f59e0b',
    '4to6': '#3b82f6',
    '7to12': '#6366f1',
    other: '#9ca3af',
};
const ACTION_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#9ca3af'];

// ── TOOLTIP SHARED ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: '0.82rem'
        }}>
            {label && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>}
            {payload.map((entry, i) => (
                <div key={i} style={{ color: entry.color || 'var(--primary)', marginBottom: 2 }}>
                    {entry.name}: <strong>{typeof entry.value === 'number' ? fmtRp(entry.value) : entry.value}</strong>
                </div>
            ))}
        </div>
    );
};

// ============================================================================
export default function DashboardBOD() {
    const user = useAuthStore((s) => s.user);

    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [trendData, setTrendData] = useState([]);

    // Filter
    const [selectedCat, setSelectedCat] = useState('');   // ED category key

    useEffect(() => {
        loadData();
        loadTrend();
    }, []);

    // ── EKSPOR CSV ────────────────────────────────────────────────────────────
    function exportCSV() {
        const { tableRows } = analytics;
        if (!tableRows.length) return;
        const headers = ['Apotek', 'Nama Produk', 'Kode Produk', 'Kategori ED', 'Terdekat ED', 'Sisa Stok', 'Cost/Unit (Rp)', 'Total Cost (Rp)', 'Status Aksi'];
        const rows = tableRows.map(r => [
            r.outletName,
            r.product,
            r.code,
            r.catLabel,
            r.earliestED,
            r.totalQty.toFixed(2),
            r.unitCost,
            r.totalCost.toFixed(0),
            r.rekomendasi || '—'
        ]);
        const csvContent = [headers, ...rows]
            .map(cols => cols.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rekap_short_ed_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function loadData() {
        setLoading(true);
        setError('');
        try {
            const data = await fetchAllProcurementStocks();
            setStocks(data);
        } catch (err) {
            setError('Gagal memuat data: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadTrend() {
        try {
            const { data, error: tErr } = await supabase
                .from('log_history')
                .select('snapshot_date, total_risk_cost')
                .order('snapshot_date', { ascending: true });
            if (tErr || !data?.length) return;

            // Group per bulan — jika ada >1 snapshot dalam sebulan, ambil yang terbaru
            const monthMap = {};
            for (const row of data) {
                const d = new Date(row.snapshot_date);
                if (isNaN(d)) continue;
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }); // "Mar 2026"
                if (!monthMap[monthKey] || row.snapshot_date > monthMap[monthKey].raw) {
                    monthMap[monthKey] = { label, value: Number(row.total_risk_cost) || 0, raw: row.snapshot_date };
                }
            }
            setTrendData(Object.values(monthMap).map(({ label, value }) => ({ label, value })));
        } catch (_) { /* silent — chart optional */ }
    }

    // ── O(n) single-pass aggregation ─────────────────────────────────────────
    const analytics = useMemo(() => {
        let totalRiskCost = 0;
        let totalExpiredCost = 0;
        const riskSkuSet = new Set();
        const riskOutletSet = new Set();

        // Maps for charts
        const outletMap = {};     // { outletName: { cost, qty } }
        const actionMap = {};     // { actionLabel: cost }
        const catMap = {};     // { catLabel: cost }
        const outletRows = [];    // for read-only table (per outlet per product grouped)
        const outletGrouped = {}; // for top-5 table

        stocks.forEach(item => {
            const cat = getEdCategory(item.ed_date);

            // Apply category filter if set
            if (selectedCat && cat !== selectedCat) return;

            const unitCost = Number(item.master_products?.unit_cost_with_vat) || 0;
            const qty = parseFloat(item.qty) || 0;
            const cost = qty * unitCost;

            const outlName = item.outlet_name || item.outlet_code || '?';
            const pName = item.master_products?.item_description || item.product_code;
            const catInfo = CATEGORIES.find(c => c.key === cat);
            const catLabel = catInfo?.label || cat;

            // 1. KPI: totalRiskCost (exclude Terkumpul)
            if (cat !== 'terkumpul') {
                totalRiskCost += cost;
                riskSkuSet.add(item.product_code);
                riskOutletSet.add(item.outlet_code);
            } else {
                totalExpiredCost += cost;
            }

            // 2. Top Outlet Bar
            if (cat !== 'terkumpul') {
                if (!outletMap[outlName]) outletMap[outlName] = { cost: 0, qty: 0 };
                outletMap[outlName].cost += cost;
                outletMap[outlName].qty += qty;
            }

            // 3. Action / Status Donut
            const action = item.status_action || 'Belum Diproses';
            if (!actionMap[action]) actionMap[action] = 0;
            actionMap[action] += cost;

            // 4. Category stacked bar
            if (cat !== 'terkumpul') {
                if (!catMap[catLabel]) catMap[catLabel] = 0;
                catMap[catLabel] += cost;
            }

            // 5. Table rows grouped per outlet
            if (cat !== 'terkumpul') {
                const key = `${item.outlet_code}__${item.product_code}`;
                if (!outletGrouped[key]) {
                    outletGrouped[key] = {
                        outletName: outlName,
                        product: pName,
                        code: item.product_code,
                        catLabel,
                        totalQty: 0,
                        totalCost: 0,
                        unitCost,
                        earliestED: item.ed_date,
                        rekomendasi: item.rekomendasi || item.status_action || ''
                    };
                }
                const g = outletGrouped[key];
                g.totalQty += qty;
                g.totalCost += cost;
                if (item.ed_date < g.earliestED) g.earliestED = item.ed_date;
                if (item.rekomendasi) g.rekomendasi = item.rekomendasi;
                else if (item.status_action && !g.rekomendasi) g.rekomendasi = item.status_action;
            }
        });

        // Top 10 outlets sorted by cost
        const topOutlets = Object.entries(outletMap)
            .map(([name, d]) => ({ name, cost: d.cost }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10);

        // Action Donut
        const actionPie = Object.entries(actionMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Category bar (sorted by category order)
        const catOrder = ['bulanIni', '1to3', '4to6', '7to12'];
        const categoryBar = catOrder.map(key => ({
            name: CATEGORIES.find(c => c.key === key)?.label || key,
            cost: catMap[CATEGORIES.find(c => c.key === key)?.label || key] || 0,
            color: CAT_COLORS[key]
        })).filter(c => c.cost > 0);

        // Table rows
        const tableRows = Object.values(outletGrouped)
            .sort((a, b) => b.totalCost - a.totalCost)
            .slice(0, 100);

        return {
            totalRiskCost,
            totalExpiredCost,
            totalRiskSku: riskSkuSet.size,
            totalRiskOutlets: riskOutletSet.size,
            topOutlets,
            actionPie,
            categoryBar,
            tableRows
        };
    }, [stocks, selectedCat]);

    // ── LOADING / ERROR ──────────────────────────────────────────────────────
    if (loading) return (
        <div className="page-loader">
            <div className="alpro-spinner"><div className="alpro-spinner-dot"></div></div>
            <div className="page-loader-text">Memuat Dasboard Eksekutif...<br /><span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Sinkronisasi risiko stok seluruh apotek</span></div>
        </div>
    );

    const { totalRiskCost, totalExpiredCost, totalRiskSku, totalRiskOutlets, topOutlets, actionPie, categoryBar, tableRows } = analytics;

    return (
        <div className="fade-up">

            {/* ── PAGE HEADER ── */}
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>Dashboard Eksekutif BOD</h2>
                    <p className={styles.pageSubtitle}>
                        Laporan makro risiko stok Short ED — selamat datang, <strong>{user?.name}</strong>.
                    </p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', marginBottom: 20 }}>
                    {error}
                </div>
            )}

            {/* ── ROW 1: FILTER ── */}
            <div className={styles.section} style={{ marginBottom: 24, padding: '14px 20px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                    <SlidersHorizontal size={16} /> Filter Kategori ED
                </div>
                <select
                    className="input-field"
                    style={{ fontSize: '0.85rem', maxWidth: 260 }}
                    value={selectedCat}
                    onChange={e => setSelectedCat(e.target.value)}
                >
                    <option value="">— Semua Kategori —</option>
                    {CATEGORIES.filter(c => c.key !== 'terkumpul').map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Menampilkan data <strong style={{ color: 'var(--primary)' }}>{tableRows.length}</strong> kombinasi Outlet–Produk
                </span>
            </div>

            {/* ── ROW 2: KPI CARDS ── */}
            <div className={styles.kpiGrid} style={{ marginBottom: 24 }}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Nilai Stok Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.red}`}><AlertTriangle size={16} /></div>
                    </div>
                    <div className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{fmtRp(totalRiskCost)}</div>
                    <div className={styles.kpiMeta}>Seluruh kategori aktif (kecuali terkumpul)</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total SKU Unik Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.amber}`}><Package size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{totalRiskSku.toLocaleString('id-ID')}</div>
                    <div className={styles.kpiMeta}>Produk unik lintas semua outlet ({totalRiskOutlets} apotek terdampak)</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Nilai Stok Sudah Terkumpul</span>
                        <div className={`${styles.kpiIconWrap} ${styles.green}`}><TrendingDown size={16} /></div>
                    </div>
                    <div className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{fmtRp(totalExpiredCost)}</div>
                    <div className={styles.kpiMeta}>Produk sudah melewati tanggal ED</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Baris Data</span>
                        <div className={`${styles.kpiIconWrap}`} style={{ background: 'var(--blue-light)' }}><Activity size={16} color="var(--blue)" /></div>
                    </div>
                    <div className={styles.kpiValue}>{stocks.length.toLocaleString('id-ID')}</div>
                    <div className={styles.kpiMeta}>Entri stok mentah termuat dari Supabase</div>
                </div>
            </div>

            {/* ── ROW 3: CHARTS ── */}
            <div className={styles.twoCol} style={{ marginBottom: 24 }}>

                {/* Donut — Status Tindakan */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Distribusi Status Tindakan (berdasarkan Nilai Cost)</span>
                    </div>
                    <div style={{ height: 320 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={actionPie}
                                    cx="50%" cy="48%"
                                    innerRadius={70} outerRadius={110}
                                    paddingAngle={4}
                                    dataKey="value"
                                    label={({ name, percent }) =>
                                        percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                                    }
                                    labelLine={false}
                                >
                                    {actionPie.map((_, i) => (
                                        <Cell key={i} fill={ACTION_COLORS[i % ACTION_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<ChartTooltip />} />
                                <Legend verticalAlign="bottom" height={40} iconType="circle" iconSize={10}
                                    formatter={(value) => <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{value}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Bar — Risiko per Kategori ED */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Nilai Risiko per Kategori ED</span>
                    </div>
                    <div style={{ height: 320 }}>
                        <ResponsiveContainer>
                            <BarChart data={categoryBar} margin={{ top: 20, right: 24, left: 10, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <XAxis
                                    dataKey="name" angle={-25} textAnchor="end" interval={0}
                                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} height={60}
                                />
                                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="cost" name="Total Cost" radius={[6, 6, 0, 0]} maxBarSize={60}>
                                    {categoryBar.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                    <LabelList dataKey="cost" position="top"
                                        formatter={fmtShort}
                                        style={{ fontSize: '0.72rem', fill: 'var(--text-secondary)', fontWeight: 600 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bar — Top 10 Outlet */}
            <div className={styles.section} style={{ marginBottom: 24 }}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Top 10 Apotek dengan Eksposur Risiko Tertinggi</span>
                </div>
                <div style={{ height: 360 }}>
                    <ResponsiveContainer>
                        <BarChart
                            data={topOutlets}
                            layout="vertical"
                            margin={{ top: 10, right: 120, left: 20, bottom: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-light)" />
                            <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                            <YAxis dataKey="name" type="category" width={150}
                                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="cost" name="Total Cost" fill="var(--primary)" radius={[0, 6, 6, 0]} maxBarSize={28}>
                                <LabelList dataKey="cost" position="right"
                                    formatter={fmtShort}
                                    style={{ fontSize: '0.72rem', fill: 'var(--text-secondary)', fontWeight: 600 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── TREN PENANGANAN STOK ED — BULANAN ── */}
            {trendData.length > 0 && (
                <div className={styles.section} style={{ marginBottom: 24 }}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Tren Nilai Stok Berisiko — Rekam Bulanan</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Sumber: <code style={{ fontSize: '0.78rem' }}>log_history</code> · Snapshot tiap tanggal 21
                        </span>
                    </div>
                    <div style={{ height: 280 }}>
                        <ResponsiveContainer>
                            <BarChart
                                data={trendData}
                                margin={{ top: 16, right: 24, left: 10, bottom: 24 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                    angle={-20} textAnchor="end" height={48}
                                />
                                <YAxis
                                    tickFormatter={fmtShort}
                                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                                    width={64}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div style={{
                                                background: 'var(--surface)', border: '1px solid var(--border)',
                                                borderRadius: 8, padding: '10px 14px',
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: '0.82rem'
                                            }}>
                                                <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
                                                <div style={{ color: 'var(--primary)' }}>
                                                    Total Stok Berisiko: <strong>{fmtRp(payload[0]?.value)}</strong>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar
                                    dataKey="value"
                                    name="Total Stok Berisiko"
                                    fill="var(--primary)"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={60}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* ── ROW 4: READ-ONLY TABLE ── */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Tabel Pantau Risiko — Top 100 Produk per Outlet</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Read-only · Diurutkan berdasarkan Total Cost tertinggi</span>
                        <button
                            onClick={exportCSV}
                            disabled={!tableRows.length}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: tableRows.length ? 'var(--primary)' : 'var(--border)', color: '#fff',
                                fontSize: '0.8rem', fontWeight: 600, transition: 'opacity 0.15s',
                                opacity: tableRows.length ? 1 : 0.5
                            }}
                        >
                            <Download size={14} /> Ekspor CSV
                        </button>
                    </div>
                </div>
                {tableRows.length === 0 ? (
                    <div className={OutletInputStyles.emptyState} style={{ padding: '60px 0' }}>
                        <Building2 size={48} color="var(--border-strong)" />
                        <p className={OutletInputStyles.emptyTitle}>Tidak ada data untuk ditampilkan</p>
                    </div>
                ) : (
                    <div className={OutletInputStyles.tableContainer} style={{ maxHeight: 560, overflowY: 'auto' }}>
                        <table className={OutletInputStyles.table} style={{ whiteSpace: 'normal' }}>
                            <thead>
                                <tr>
                                    <th style={{ minWidth: 160 }}>Nama Apotek</th>
                                    <th style={{ minWidth: 220 }}>Nama Produk</th>
                                    <th style={{ minWidth: 110 }}>Kode Produk</th>
                                    <th style={{ minWidth: 130 }}>Kategori ED</th>
                                    <th style={{ minWidth: 100 }}>Terdekat ED</th>
                                    <th style={{ textAlign: 'right', minWidth: 90 }}>Sisa Stok</th>
                                    <th style={{ textAlign: 'right', minWidth: 120 }}>Cost/Unit</th>
                                    <th style={{ textAlign: 'right', minWidth: 140 }}>Total Cost</th>
                                    <th style={{ minWidth: 180 }}>Status Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                            {row.outletName}
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{row.product}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.code}</td>
                                        <td>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                                                background: row.catLabel.includes('Bulan Berjalan') ? 'var(--danger-light)' :
                                                    row.catLabel.includes('1–3') ? '#fef3c7' :
                                                        row.catLabel.includes('4–6') ? 'var(--blue-light)' :
                                                            'var(--surface-raised)',
                                                color: row.catLabel.includes('Bulan Berjalan') ? 'var(--danger)' :
                                                    row.catLabel.includes('1–3') ? '#92400e' :
                                                        row.catLabel.includes('4–6') ? 'var(--blue)' :
                                                            'var(--text-secondary)'
                                            }}>
                                                {row.catLabel}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{formatDate(row.earliestED)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary-dark)', fontSize: '0.85rem' }}>
                                            {row.totalQty.toFixed(2)}
                                        </td>
                                        <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            {fmtRp(row.unitCost)}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)', fontSize: '0.85rem' }}>
                                            {fmtRp(row.totalCost)}
                                        </td>
                                        <td style={{ fontSize: '0.82rem', wordBreak: 'break-word' }}>
                                            {row.rekomendasi ? (
                                                <span style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>{row.rekomendasi}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
