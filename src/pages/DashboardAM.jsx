import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Package, Store, TrendingDown, RefreshCw, Loader2, Inbox, Activity, ChevronDown, ChevronRight, TableProperties } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchAMOutlets, fetchAMStocks } from '../services/amService';
import { getEdCategory, formatDate, getRekomendasi, CATEGORIES } from '../utils/edHelpers';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import styles from './Dashboard.module.css';
import OutletInputStyles from './OutletInputPage.module.css';

export default function DashboardAM() {
    const user = useAuthStore((s) => s.user);

    const [outlets, setOutlets] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedOutlet, setSelectedOutlet] = useState('ALL');

    // State untuk Accordion Kategori dan SVG Chart
    const [openCategories, setOpenCategories] = useState({ bulanIni: true, '1to3': true });
    const [hoveredSlice, setHoveredSlice] = useState(null);

    const toggleCategory = (key) => {
        setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));
    };

    useEffect(() => {
        loadData();
    }, [user?.name]);

    async function loadData() {
        if (!user || user.role !== 'AM') return;
        setLoading(true);
        setError('');
        try {
            const amOutlets = await fetchAMOutlets(user.name);
            setOutlets(amOutlets);

            if (amOutlets.length > 0) {
                const codes = amOutlets.map(o => o.outlet_code);
                const amStocks = await fetchAMStocks(codes);
                setStocks(amStocks);
            } else {
                setStocks([]);
            }
        } catch (err) {
            setError('Gagal memuat data Area: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    const outletNameMap = useMemo(() => {
        const map = {};
        outlets.forEach(o => map[o.outlet_code] = o.outlet_name);
        return map;
    }, [outlets]);

    const filteredStocks = useMemo(() => {
        if (selectedOutlet === 'ALL') return stocks;
        return stocks.filter(s => s.outlet_code === selectedOutlet);
    }, [stocks, selectedOutlet]);

    const formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

    // --- AGREGASI KPI ---
    const kpiData = useMemo(() => {
        let totalRisiko = 0, totalTerkumpul = 0;
        let setSku = new Set(), setOutletLapor = new Set();

        filteredStocks.forEach(s => {
            const cat = getEdCategory(s.ed_date);
            const price = s.master_products?.price_discounted || s.master_products?.price_non_member || 0;
            const value = s.qty * price;

            setOutletLapor.add(s.outlet_code);

            if (cat === 'terkumpul') totalTerkumpul += value;
            else if (cat !== 'other') {
                totalRisiko += value;
                setSku.add(s.product_code);
            }
        });

        const totalOutletCoverage = selectedOutlet === 'ALL' ? outlets.length : 1;
        const coverageText = totalOutletCoverage > 0 ? `${setOutletLapor.size} dari ${totalOutletCoverage} Outlet` : '0 Outlet';

        return { totalRisiko, skuCount: setSku.size, laporText: coverageText, totalTerkumpul };
    }, [filteredStocks, outlets.length, selectedOutlet]);

    // --- AGREGASI CHARTS ---
    const chartData = useMemo(() => {
        let distribution = { bulanIni: 0, '1to3': 0, '4to6': 0, '7to12': 0, sum: 0 };
        let productMap = {};
        let outletMap = {};

        filteredStocks.forEach(s => {
            const cat = getEdCategory(s.ed_date);
            const price = s.master_products?.price_discounted || s.master_products?.price_non_member || 0;
            const riskValue = s.qty * price;

            // Pie Chart (Distribusi)
            if (distribution[cat] !== undefined) {
                distribution[cat] += riskValue;
                distribution.sum += riskValue;
            }

            // Hanya produk & outlet berisiko (bukan terkumpul / >12bln)
            if (cat !== 'terkumpul' && cat !== 'other') {
                // Top Products
                if (!productMap[s.product_code]) {
                    productMap[s.product_code] = {
                        name: s.master_products?.item_description || s.product_code,
                        value: 0
                    };
                }
                productMap[s.product_code].value += riskValue;

                // Outlet Ranking
                if (!outletMap[s.outlet_code]) {
                    outletMap[s.outlet_code] = {
                        name: outletNameMap[s.outlet_code] || s.outlet_code,
                        value: 0
                    };
                }
                outletMap[s.outlet_code].value += riskValue;
            }
        });

        const topProducts = Object.values(productMap).sort((a, b) => b.value - a.value).slice(0, 5);
        const maxProductRisk = topProducts.length > 0 ? topProducts[0].value : 1;

        const topOutlets = Object.values(outletMap).sort((a, b) => b.value - a.value);

        return { distribution, topProducts, maxProductRisk, topOutlets };
    }, [filteredStocks, outletNameMap]);

    // Render logic untuk SVG Donut Chart dengan Tooltip
    const renderPieChart = () => {
        if (chartData.distribution.sum === 0) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
                    Tidak ada nilai risiko
                </div>
            );
        }

        const slicesData = [
            { id: 'bulanIni', label: 'Bulan Ini', color: '#dc2626', value: chartData.distribution.bulanIni },
            { id: '1to3', label: '1-3 Bulan', color: '#f59e0b', value: chartData.distribution['1to3'] },
            { id: '4to6', label: '4-6 Bulan', color: '#2563eb', value: chartData.distribution['4to6'] },
            { id: '7to12', label: '7-12 Bulan', color: '#64748b', value: chartData.distribution['7to12'] },
        ].filter(s => s.value > 0);

        let currentOffset = 0;
        const radius = 15.915494309189533; // 2 * PI * R = 100

        return (
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }} onMouseLeave={() => setHoveredSlice(null)}>
                <svg viewBox="0 0 42 42" style={{ width: '180px', height: '180px', transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    <circle cx="21" cy="21" r={radius} fill="transparent" stroke="var(--surface)" strokeWidth="6" />
                    {slicesData.map(slice => {
                        const targetPercent = (slice.value / chartData.distribution.sum) * 100;
                        const sliceOffset = -currentOffset;
                        currentOffset += targetPercent;

                        const isHovered = hoveredSlice?.id === slice.id;

                        return (
                            <circle
                                key={slice.id}
                                cx="21"
                                cy="21"
                                r={radius}
                                fill="transparent"
                                stroke={slice.color}
                                strokeWidth={isHovered ? "8" : "6"}
                                strokeDasharray={`${targetPercent} ${100 - targetPercent}`}
                                strokeDashoffset={sliceOffset}
                                style={{
                                    transition: 'stroke-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                                onMouseEnter={() => setHoveredSlice({ ...slice, percent: targetPercent })}
                            />
                        );
                    })}
                </svg>

                {/* Tooltip Float */}
                {hoveredSlice && (
                    <div style={{
                        position: 'absolute',
                        top: '40%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        minWidth: '160px',
                        textAlign: 'center',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{hoveredSlice.label}</div>
                        <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700, margin: '4px 0' }}>
                            {formatCurrency(hoveredSlice.value)}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: hoveredSlice.color, fontWeight: 700 }}>
                            ({hoveredSlice.percent.toFixed(1)}%)
                        </div>
                    </div>
                )}

                {/* Static Legends */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', fontSize: '0.85rem' }}>
                    {slicesData.map(s => {
                        const isFaded = hoveredSlice && hoveredSlice.id !== s.id;
                        return (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isFaded ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                                <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
                                {s.label} ({((s.value / chartData.distribution.sum) * 100).toFixed(1)}%)
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const groupedStocks = CATEGORIES.map(cat => ({
        ...cat,
        items: filteredStocks.filter(s => getEdCategory(s.ed_date) === cat.key)
    }));

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', gap: '16px' }}>
                <Loader2 size={48} className="spinner" color="var(--primary)" />
                <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Mengumpulkan data stok Area Manager...</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Mohon tunggu sebentar, sedang memproses sinkronisasi produk.</p>
            </div>
        );
    }

    return (
        <div className="fade-up">
            <div className={styles.pageHeader}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <h2 className={styles.pageTitle}>Dashboard Area Manager</h2>
                        <p className={styles.pageSubtitle}>
                            Selamat datang, <strong>{user?.name}</strong> — pantau kondisi risiko ED di area Anda.
                        </p>
                    </div>
                    <button onClick={loadData} className="btn btn-outline" disabled={loading} style={{ height: 'fit-content' }}>
                        <RefreshCw size={16} className={loading ? 'spinner' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className={OutletInputStyles.alert} style={{ marginBottom: '20px' }}>
                    <span>{error}</span>
                </div>
            )}

            {/* Filter */}
            <div className={styles.section} style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface)' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Filter Apotek (Outlet)
                </label>
                <select className="input-field" value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)} style={{ maxWidth: '400px' }}>
                    <option value="ALL">Semua Outlet ({outlets.length})</option>
                    {outlets.map(o => <option key={o.outlet_code} value={o.outlet_code}>{o.outlet_name}</option>)}
                </select>
            </div>

            {/* KPIs */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Nilai Stok Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.red}`}><TrendingDown size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpiData.totalRisiko)}</div>
                    <div className={styles.kpiMeta}>Estimasi nilai mendekati ED</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Jumlah SKU Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.amber}`}><Package size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{kpiData.skuCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Item</span></div>
                    <div className={styles.kpiMeta}>Total Varian Produk</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Status Laporan Area</span>
                        <div className={`${styles.kpiIconWrap} ${styles.blue}`}><Store size={16} /></div>
                    </div>
                    <div className={styles.kpiValue} style={{ fontSize: '1.4rem' }}>{kpiData.laporText}</div>
                    <div className={styles.kpiMeta}>Telah menginput data ED</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Terkumpul / Ditarik</span>
                        <div className={`${styles.kpiIconWrap} ${styles.green}`}><Activity size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpiData.totalTerkumpul)}</div>
                    <div className={styles.kpiMeta}>Produk kedaluwarsa ditarik</div>
                </div>
            </div>

            <div className={styles.twoCol} style={{ marginBottom: '16px' }}>
                {/* Donut Chart (CSS) */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Distribusi Risiko per Kategori</span>
                    </div>
                    <div style={{ padding: '20px 10px' }}>
                        {renderPieChart()}
                    </div>
                </div>

                {/* Bar Chart (CSS) */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Top 5 Produk Berisiko</span>
                    </div>
                    <div style={{ padding: '10px 0', minHeight: '200px' }}>
                        {chartData.topProducts.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>Tidak ada data produk</div>
                        ) : (
                            chartData.topProducts.map((p, idx) => (
                                <div key={idx} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>{p.name}</span>
                                        <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{formatCurrency(p.value)}</span>
                                    </div>
                                    <div style={{ width: '100%', background: 'var(--bg-app)', height: '10px', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${(p.value / chartData.maxProductRisk) * 100}%`, background: 'var(--danger)', height: '100%', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Peringkat Apotek */}
            <div className={styles.section} style={{ marginBottom: '24px' }}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Peringkat Apotek Berisiko (Berdasarkan Nilai Stok)</span>
                </div>
                <div className={OutletInputStyles.tableContainer}>
                    <table className={OutletInputStyles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '60px', textAlign: 'center' }}>No.</th>
                                <th>Nama Apotek</th>
                                <th style={{ textAlign: 'right' }}>Nilai Risiko</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chartData.topOutlets.length === 0 ? (
                                <tr><td colSpan="3" style={{ textAlign: 'center', height: '100px', color: 'var(--text-muted)' }}>Tidak ada data apotek berisiko</td></tr>
                            ) : (
                                chartData.topOutlets.map((o, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{idx + 1}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>{o.name}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{formatCurrency(o.value)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tabel Data Akordeon */}
            {loading ? (
                <div className={OutletInputStyles.loadingState}><Loader2 size={32} className="spinner" style={{ color: 'var(--primary)', marginBottom: '16px' }} /><p>Menganalisis area...</p></div>
            ) : filteredStocks.length === 0 ? (
                <div className={OutletInputStyles.emptyState}><Inbox size={48} color="var(--border-strong)" style={{ marginBottom: '16px' }} /><p className={OutletInputStyles.emptyTitle}>Data Tidak Ditemukan</p></div>
            ) : (
                <div style={{ marginTop: '32px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>Rincian Stok Area</h3>
                    {groupedStocks.map(group => {
                        if (group.items.length === 0) return null;
                        const isOpen = openCategories[group.key];
                        return (
                            <div key={group.key} className={OutletInputStyles.accordionSection} style={{ marginBottom: '12px' }}>
                                <div className={`${OutletInputStyles.accordionHeader} ${OutletInputStyles[group.badge]} ${isOpen ? OutletInputStyles.open : ''}`} onClick={() => toggleCategory(group.key)}>
                                    <div className={OutletInputStyles.headerLeft}>
                                        <div className={OutletInputStyles.iconWrap}><BarChart3 size={18} /></div>
                                        <div>
                                            <h3 className={OutletInputStyles.categoryTitle}>{group.label}</h3>
                                            <p className={OutletInputStyles.categorySubtitle}>{group.items.length} item ditemukan</p>
                                        </div>
                                    </div>
                                    <div className={OutletInputStyles.headerRight}>
                                        {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                    </div>
                                </div>
                                {isOpen && (
                                    <div className={OutletInputStyles.accordionContent}>
                                        <div className={OutletInputStyles.tableContainer}>
                                            <table className={OutletInputStyles.table}>
                                                <thead>
                                                    <tr>
                                                        <th>Apotek</th>
                                                        <th>Kode & Nama Item</th>
                                                        <th>Batch</th>
                                                        <th>ED</th>
                                                        <th style={{ textAlign: 'right' }}>Qty</th>
                                                        <th>Remark</th>
                                                        <th>Rekomendasi Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.items.map(s => {
                                                        const rowAlertClass = group.rowAlert ? OutletInputStyles.rowCritical : '';
                                                        return (
                                                            <tr key={s.id} className={rowAlertClass}>
                                                                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{outletNameMap[s.outlet_code] || s.outlet_code}</td>
                                                                <td>
                                                                    <div className={OutletInputStyles.itemCode}>{s.product_code}</div>
                                                                    <div className={OutletInputStyles.itemName}>{s.master_products?.item_description || '-'}</div>
                                                                </td>
                                                                <td style={{ fontWeight: 500 }}>{s.batch_id}</td>
                                                                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.ed_date)}</td>
                                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.qty}</td>
                                                                <td>{s.remark || '-'}</td>
                                                                <td style={{ fontSize: '0.86rem', whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '150px' }}>{getRekomendasi(s, group.key)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
