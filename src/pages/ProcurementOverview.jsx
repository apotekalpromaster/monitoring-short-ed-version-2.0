import { useState, useEffect, useMemo } from 'react';
import { SlidersHorizontal, Loader2, PackageSearch } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchAllProcurementStocks } from '../services/procurementService';
import { getEdCategory, CATEGORIES } from '../utils/edHelpers';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
    Treemap
} from 'recharts';
import styles from './Dashboard.module.css';

const formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatShortNum = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n;

export default function ProcurementOverview() {
    const user = useAuthStore((s) => s.user);

    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filter States
    const [selectedOutlet, setSelectedOutlet] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

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

    const filterOptions = useMemo(() => {
        const outletSet = new Set();
        stocks.forEach(s => {
            if (s.outlet_name) outletSet.add(s.outlet_name);
        });
        return { outlets: Array.from(outletSet).sort() };
    }, [stocks]);

    const filteredData = useMemo(() => {
        return stocks.reduce((acc, item) => {
            if (selectedCategory && getEdCategory(item.ed_date) !== selectedCategory) return acc;
            if (selectedOutlet && item.outlet_name !== selectedOutlet) return acc;
            if (getEdCategory(item.ed_date) === 'terkumpul') return acc;

            // Only aggregate positive quantities
            const rawQty = parseFloat(item.qty) || 0;
            if (rawQty > 0) acc.push(item);

            return acc;
        }, []);
    }, [stocks, selectedOutlet, selectedCategory]);

    const { actionPieData, supplierBarData, topProductsBarData, treemapData } = useMemo(() => {
        let costBelumTindak = 0, costSudahTindak = 0;
        const _supplier = {};
        const _products = {};
        const _cat = {};

        filteredData.forEach(item => {
            const cat = getEdCategory(item.ed_date);
            const price = Number(item.master_products?.unit_cost_with_vat) || 0;
            const cost = item.qty * price;

            // 1. Status Aksi Pie Chart
            if (item.status_action) costSudahTindak += cost;
            else costBelumTindak += cost;

            if (cat !== 'terkumpul' && cat !== 'other') {
                // 2. Top Supplier Bar
                const supName = item.master_products?.supplier || item.master_products?.supplier_name;
                const safeSupName = supName ? supName : (item.product_code ? item.product_code.substring(0, 3) : 'Lainnya');
                if (!_supplier[safeSupName]) _supplier[safeSupName] = 0;
                _supplier[safeSupName] += cost;

                // 3. Top Products Bar
                const pCode = item.product_code;
                const pName = item.master_products?.item_description || pCode;
                const shortPName = pName.length > 25 ? pName.substring(0, 25) + '...' : pName;
                if (!_products[pCode]) _products[pCode] = { name: shortPName, cost: 0, outlets: new Set() };
                _products[pCode].cost += cost;
                _products[pCode].outlets.add(item.outlet_code);

                // 4. Treemap Category
                const catInfo = CATEGORIES.find(c => c.key === cat);
                const catLabel = catInfo ? catInfo.label : cat;
                if (!_cat[catLabel]) _cat[catLabel] = 0;
                _cat[catLabel] += cost;
            }
        });

        const actionPieData = [
            { name: 'Belum Ada Aksi', value: costBelumTindak, color: '#ef4444' },
            { name: 'Sudah Dieksekusi', value: costSudahTindak, color: '#10b981' }
        ].filter(d => d.value > 0);

        const supplierBarData = Object.entries(_supplier)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, value]) => ({ name, value }));

        const topProductsBarData = Object.values(_products)
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10)
            .map(p => ({
                name: p.name,
                cost: p.cost,
                outlets: p.outlets.size
            }));

        const treemapData = Object.entries(_cat).map(([name, value]) => ({
            name, size: value
        }));

        return { actionPieData, supplierBarData, topProductsBarData, treemapData };
    }, [filteredData]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: 'var(--surface)', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{label || payload[0].name}</div>
                    {payload.map((entry, index) => (
                        <div key={index} style={{ fontSize: '0.85rem', color: entry.color || 'var(--primary)' }}>
                            {entry.name === 'outlets' ? 'Jumlah Apotek: ' : 'Total Biaya: '}
                            <strong>{entry.name === 'outlets' ? entry.value : formatCurrency(entry.value)}</strong>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    // ── Orange gradient for treemap by rank ──────────────────────────────────
    const TREEMAP_ORANGE_PALETTE = ['#C2410C', '#EA580C', '#F97316', '#FB923C', '#FDBA74', '#FED7AA'];

    const customTreemapContent = ({ x, y, width, height, index, name, size }) => {
        if (!width || !height || width < 2 || height < 2) return null;
        const color = TREEMAP_ORANGE_PALETTE[index % TREEMAP_ORANGE_PALETTE.length];
        const showLabel = width > 60 && height > 30;
        return (
            <g>
                <rect x={x} y={y} width={width} height={height} rx={4}
                    style={{ fill: color, stroke: '#fff', strokeWidth: 2, cursor: 'default' }} />
                {showLabel && (
                    <>
                        <text x={x + width / 2} y={y + height / 2 - 6}
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ fill: '#fff', fontSize: Math.min(12, width / 8), fontWeight: 700, pointerEvents: 'none' }}>
                            {name}
                        </text>
                        <text x={x + width / 2} y={y + height / 2 + 10}
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ fill: 'rgba(255,255,255,0.85)', fontSize: Math.min(10, width / 10), pointerEvents: 'none' }}>
                            {formatShortNum(size)}
                        </text>
                    </>
                )}
            </g>
        );
    };

    if (loading) return (
        <div className="fade-up" style={{ padding: '0 4px' }}>
            {/* Header skeleton */}
            <div style={{ marginBottom: 24 }}>
                <div className="skeleton-text" style={{ width: '40%', height: 24, marginBottom: 10 }} />
                <div className="skeleton-text" style={{ width: '55%' }} />
            </div>
            {/* Filter bar skeleton */}
            <div className="skeleton-card" style={{ height: 100, marginBottom: 24 }} />
            {/* Row 1: two chart skeletons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div className="skeleton-card" style={{ height: 340 }} />
                <div className="skeleton-card" style={{ height: 340 }} />
            </div>
            {/* Row 2: wide chart */}
            <div className="skeleton-card" style={{ height: 380, marginBottom: 24 }} />
            {/* Row 3: treemap */}
            <div className="skeleton-card" style={{ height: 320 }} />
        </div>
    );

    return (
        <div className="fade-up">
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>Dashboard Analitik (Procurement)</h2>
                    <p className={styles.pageSubtitle}>Laporan eksekutif persebaran risiko produk Short ED.</p>
                </div>
            </div>

            {error && <div className="alert-danger" style={{ padding: '12px', borderRadius: '8px', background: 'var(--danger-light)', color: 'var(--danger)', marginBottom: '20px' }}>{error}</div>}

            {/* Filter Global */}
            <div className={styles.section} style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <SlidersHorizontal size={18} /> Filter Data Global
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Apotek (Outlet)</label>
                        <select className="input-field" style={{ width: '100%', fontSize: '0.85rem' }} value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}>
                            <option value="">-- Semua Apotek --</option>
                            {filterOptions.outlets.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Jarak ED</label>
                        <select className="input-field" style={{ width: '100%', fontSize: '0.85rem' }} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                            <option value="">-- Semua Kategori --</option>
                            {CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {filteredData.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center' }}><PackageSearch size={48} color="var(--border-strong)" style={{ margin: '0 auto 16px' }} /><p style={{ color: 'var(--text-muted)' }}>Data Tidak Ditemukan</p></div>
            ) : (
                <>
                    {/* Baris 1: Pie & Top 5 */}
                    <div className={styles.twoCol} style={{ marginBottom: '24px' }}>
                        <div className={styles.section} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Ringkasan Status Aksi</span></div>
                            <div style={{ height: '300px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={actionPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                                            {actionPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                        </Pie>
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Top 5 Supplier Berisiko (Cost)</span></div>
                            <div style={{ height: '300px', width: '100%', paddingRight: '16px' }}>
                                <ResponsiveContainer>
                                    <BarChart data={supplierBarData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-light)" />
                                        <XAxis type="number" tickFormatter={formatShortNum} stroke="var(--text-muted)" fontSize={12} />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                            {supplierBarData.map((_, i) => (
                                                <Cell key={i} fill={['#C2410C', '#EA580C', '#F97316', '#FB923C', '#FDBA74'][i] || '#F97316'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Baris 2: Top 10 Products Combo (Cost + Outlets) */}
                    <div className={styles.section} style={{ marginBottom: '24px' }}>
                        <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Analisis Penyebaran Risiko - Top 10 Produk</span></div>
                        <div style={{ height: '350px', width: '100%' }}>
                            <ResponsiveContainer>
                                <BarChart data={topProductsBarData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} interval={0} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                    <YAxis yAxisId="left" orientation="left" tickFormatter={formatShortNum} stroke="var(--text-muted)" fontSize={12} />
                                    <YAxis yAxisId="right" orientation="right" stroke="var(--danger)" fontSize={12} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Bar yAxisId="left" dataKey="cost" name="Total Biaya" fill="var(--primary)" barSize={32} radius={[4, 4, 0, 0]} />
                                    <Bar yAxisId="right" dataKey="outlets" name="Jumlah Apotek" fill="var(--danger)" barSize={8} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Baris 3: Treemap Category */}
                    <div className={styles.section} style={{ marginBottom: '24px' }}>
                        <div className={styles.sectionHeader}><span className={styles.sectionTitle}>Risiko Produk ED Berdasarkan Total Biaya</span></div>
                        <div style={{ height: '300px', width: '100%' }}>
                            <ResponsiveContainer>
                                <Treemap
                                    data={treemapData}
                                    dataKey="size"
                                    aspectRatio={4 / 3}
                                    stroke="#fff"
                                    content={customTreemapContent}
                                >
                                    <RechartsTooltip content={<CustomTooltip />} />
                                </Treemap>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
