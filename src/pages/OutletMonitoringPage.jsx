/**
 * OutletMonitoringPage.jsx — Monitoring Produk Short ED
 *
 * Menampilkan riwayat seluruh produk Short ED yang sudah diinput outlet ini,
 * dikategorikan berdasarkan jarak Tanggal ED dari hari ini.
 *
 * Menggunakan Layout Arkodeon (Accordion) yang bisa dibuka-tutup.
 * Kategori teratas terbuka secara default.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Package, AlertTriangle, Calendar,
    CheckCircle2, RefreshCw, Loader2, Inbox, ChevronDown, ChevronRight,
    Edit2, Save, X, Download, Upload, Search
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchOutletStocks, updateStockEntry, saveBulkStockEntries } from '../services/outletService';
import { supabase } from '../services/supabaseClient';
import styles from './OutletInputPage.module.css';

import { getEdCategory, formatDate, monthsUntilED, getRekomendasi, CATEGORIES } from '../utils/edHelpers';

// ── Single Source of Truth: Periode ED yang diizinkan ──
const MIN_ED_DATE = '2025-09-01';
const MAX_ED_DATE = '2027-03-31';
const ED_PERIOD_LABEL = '1 Sep 2025 - 31 Mar 2027';


export default function OutletMonitoringPage() {
    const user = useAuthStore(s => s.user);

    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [excludedCodes, setExcludedCodes] = useState(new Set());

    // Default terbuka: Kategori teratas (biasanya ED Bulan Berjalan, atau 1-3 jika Kosong)
    // Disimpan sebagai objek boolean: { 'bulanIni': true, '1to3': false ... }
    const [openPanels, setOpenPanels] = useState({});
    const [searchQuery, setSearchQuery] = useState('');

    // ── Inline Editing State ──
    const [editingRowId, setEditingRowId] = useState(null);
    const [editForm, setEditForm] = useState({ batchId: '', edDate: '', qty: '', remark: '' });
    const [savingId, setSavingId] = useState(null);

    const togglePanel = (catKey) => {
        setOpenPanels(prev => ({ ...prev, [catKey]: !prev[catKey] }));
    };

    // ── Inline Editing Handlers ──
    const handleEditStart = (item) => {
        setEditingRowId(item.id);
        setEditForm({
            batchId: item.batch_id || '',
            edDate: item.ed_date || '',
            qty: item.qty || '',
            remark: item.remark || ''
        });
    };

    const handleEditCancel = () => {
        setEditingRowId(null);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditForm(prev => ({ ...prev, [name]: value }));
    };
    const handleEditSave = async (id) => {
        if (!editForm.batchId.trim() || !editForm.edDate || !editForm.qty) {
            alert('Batch, Tanggal ED, dan Qty wajib diisi.');
            return;
        }

        // Period Validation
        if (editForm.edDate < MIN_ED_DATE || editForm.edDate > MAX_ED_DATE) {
            alert(`Gagal simpan: Tanggal ED di luar periode yang diizinkan (${ED_PERIOD_LABEL}).`);
            return;
        }

        setSavingId(id);
        try {
            await updateStockEntry(id, editForm);

            // Perbarui state lokal agar tidak perlu fetch ulang seluruh tabel
            setStocks(prevStocks => prevStocks.map(s => {
                if (s.id === id) {
                    return {
                        ...s,
                        batch_id: editForm.batchId.toUpperCase(),
                        ed_date: editForm.edDate,
                        qty: parseFloat(editForm.qty),
                        remark: editForm.remark
                    };
                }
                return s;
            }));
            setEditingRowId(null);
        } catch (err) {
            alert('Gagal menyimpan perubahan: ' + err.message);
        } finally {
            setSavingId(null);
        }
    };

    const loadData = useCallback(async () => {
        if (!user?.code) return;
        setLoading(true);
        setError(null);
        try {
            const [data, excludeRes] = await Promise.all([
                fetchOutletStocks(user.code),
                supabase.from('procode_exclude').select('product_code')
            ]);
            setStocks(data);
            setLastUpdated(new Date());

            if (!excludeRes.error && excludeRes.data) {
                setExcludedCodes(new Set(excludeRes.data.map(r => String(r.product_code).trim())));
            }

            // Auto-open arkodeon yang memiliki isi paling mendesak
            const groupedCounts = {};
            data.forEach(s => {
                const cat = getEdCategory(s.ed_date);
                groupedCounts[cat] = (groupedCounts[cat] || 0) + 1;
            });

            // Tentukan kategori urutan pertama yang memiliki isi untuk dibuka default
            const initialOpen = {};
            let firstFound = false;
            CATEGORIES.forEach(cat => {
                const count = groupedCounts[cat.key] || 0;
                if (!firstFound && count > 0) {
                    initialOpen[cat.key] = true;
                    firstFound = true;
                } else {
                    initialOpen[cat.key] = false;
                }
            });
            setOpenPanels(initialOpen);

        } catch (err) {
            setError('Gagal memuat data: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [user?.code]);

    // ── CSV Download & Upload ──
    const handleDownloadCSV = () => {
        if (!stocks || stocks.length === 0) {
            alert('Tidak ada data untuk diunduh.');
            return;
        }

        const headers = ['Original Unique ID', 'Kategori', 'Nama Produk', 'Kode Produk', 'Batch ID', 'Tanggal ED', 'Qty', 'Remark', 'Rekomendasi'];
        const csvRows = [headers.join(',')];

        stocks.forEach(s => {
            const catInfo = CATEGORIES.find(c => c.key === getEdCategory(s.ed_date));
            const categoryLabel = catInfo ? catInfo.label : 'Lainnya';
            const itemName = s.master_products?.item_description || '';
            const rekomen = getRekomendasi(s, getEdCategory(s.ed_date));

            // Text rekomendasi bisa berupa React Element, kita ambil teks dasarnya jika memungkinkan (sangat sederhana via Regex/strip) 
            // Namun untuk simplicity & safety format lama, jika object, kita abaikan atau render standar.
            const rekomenText = typeof rekomen === 'string' ? rekomen : (s.status_action ? `Ditinjau: ${s.status_action}` : '');

            // Format STRICT: Escape koma dalam teks, dan bungkus kode & tanggal dengan ="... "
            const sanitize = (text) => `"${(text || '').toString().replace(/"/g, '""')}"`;

            // Gunakan ID asli Supabase. Jika kebetulan kosong (kasus langka edit lokal), beri penanda NEW
            const originalUniqueId = s.id ? s.id : `NEW_${s.product_code}_${s.ed_date}`;

            const row = [
                sanitize(originalUniqueId),
                sanitize(categoryLabel),
                sanitize(itemName),
                `="""${s.product_code}"""`, // STRICT EXCEL
                sanitize(s.batch_id),
                `="""${s.ed_date}"""`, // STRICT EXCEL
                s.qty,
                sanitize(s.remark),
                sanitize(rekomenText)
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Monitoring_ED_${user?.code}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleUploadCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            const text = await file.text();
            // Split baris (dukung both \n dan \r\n)
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) throw new Error('File CSV kosong atau tidak valid.');

            // Parser CSV yang handal (menangani koma di dalam quote dan escaped quotes "")
            const parseCsvLine = (text) => {
                let ret = [], col = '', inQuote = false;
                for (let j = 0; j < text.length; j++) {
                    let c = text[j];
                    if (inQuote && c === '"' && text[j + 1] === '"') {
                        col += '"'; j++;
                    } else if (c === '"') {
                        inQuote = !inQuote;
                    } else if (c === ',' && !inQuote) {
                        ret.push(col); col = '';
                    } else {
                        col += c;
                    }
                }
                ret.push(col);
                return ret;
            };

            const records = [];
            // Parse mulai baris kedua (index 1) skip header
            for (let i = 1; i < lines.length; i++) {
                const cols = parseCsvLine(lines[i]);

                // Clean data (hapus bungkus format Excel ="""...""" atau "...")
                const cleanStr = (str) => {
                    if (!str) return '';
                    let s = str.trim();
                    // Hapus awalan '=' jika merupakan indikasi formula Excel wrapper
                    if (s.startsWith('=')) {
                        s = s.substring(1); // Hapus '='
                    }
                    // Hapus semua tanda kutip ganda di awal dan di akhir tanpa pandang bulu
                    s = s.replace(/^"+/, '').replace(/"+$/, '');
                    return s.trim();
                };

                // Helper deteksi apakah ID valid untuk upsert (bukan data baru "NEW_...")
                const isValidIdForUpsert = (str) => {
                    const s = String(str).trim();
                    return s.length > 0 && !s.startsWith('NEW_');
                };

                // Array index mapping berdasarkan Header asli:
                // 0:Unique ID, 1:Kategori, 2:Nama Produk, 3:Kode Produk, 4:Batch ID, 5:Tanggal ED, 6:Qty, 7:Remark

                const rawUniqueId = cleanStr(cols[0]);
                const rawProductCode = cols[3];
                const rawBatch = cols[4];
                const rawEdDate = cols[5];
                const rawQty = cols[6];
                const rawRemark = cols[7] || '';

                if (rawProductCode && rawEdDate && rawBatch) {
                    const mappedData = {
                        productCode: cleanStr(rawProductCode),
                        batchId: cleanStr(rawBatch),
                        edDate: cleanStr(rawEdDate),
                        qty: parseFloat(cleanStr(rawQty) || 0),
                        remark: cleanStr(rawRemark)
                    };

                    // Hanya masukkan ID jika formatnya bukan penanda data baru
                    if (isValidIdForUpsert(rawUniqueId)) {
                        mappedData.id = rawUniqueId;
                    }

                    records.push(mappedData);
                }
            }

            if (records.length === 0) throw new Error('Tidak ada data valid yang bisa dimuat.');

            // Partial-success: pisah valid vs invalid, jangan block semua baris
            const validRecords = records.filter(r => r.edDate >= MIN_ED_DATE && r.edDate <= MAX_ED_DATE);
            const invalidCount = records.length - validRecords.length;

            if (validRecords.length === 0) {
                throw new Error(`Semua ${records.length} baris ditolak. Tanggal ED seluruhnya di luar periode ${ED_PERIOD_LABEL}.`);
            }

            const res = await saveBulkStockEntries(user.code, validRecords);

            const msg = invalidCount > 0
                ? `✅ Berhasil: ${res.count} baris tersimpan.\n⚠️ Dilewati: ${invalidCount} baris (ED di luar periode ${ED_PERIOD_LABEL}).`
                : `✅ Berhasil mengunggah ${res.count} data stok!`;
            alert(msg);
            loadData();
        } catch (err) {
            alert('Gagal mengunggah CSV: ' + err.message);
            setLoading(false);
        }

        // Reset file input
        e.target.value = '';
    };

    useEffect(() => { loadData(); }, [loadData]);

    const totalItem = stocks.length;
    const kritisCount = stocks.filter(s => getEdCategory(s.ed_date) === 'bulanIni').length;
    const nearCount = stocks.filter(s => getEdCategory(s.ed_date) === '1to3').length;
    const terkumpulCount = stocks.filter(s => getEdCategory(s.ed_date) === 'terkumpul').length;

    // ── Search filter: runs before grouping ──────────────────────────────────
    // useMemo: hanya recompute saat `stocks` atau `searchQuery` berubah.
    const filteredStocks = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return stocks;
        return stocks.filter(s => {
            const name = (s.master_products?.item_description || '').toLowerCase();
            const code = (s.product_code || '').toLowerCase();
            return name.includes(q) || code.includes(q);
        });
    }, [stocks, searchQuery]);

    // ── Grouped: berbasis filteredStocks (bukan stocks mentah) ───────────────
    const grouped = useMemo(() => {
        const g = {};
        filteredStocks.forEach(s => {
            const cat = getEdCategory(s.ed_date);
            if (!g[cat]) g[cat] = [];
            g[cat].push(s);
        });
        return g;
    }, [filteredStocks]);

    // ── Open panels: saat search aktif, paksa buka semua kategori yang punya hasil ──
    const derivedOpenPanels = useMemo(() => {
        if (!searchQuery.trim()) return openPanels;
        const forced = {};
        CATEGORIES.forEach(cat => {
            forced[cat.key] = !!(grouped[cat.key]?.length);
        });
        return forced;
    }, [searchQuery, grouped, openPanels]);

    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <div className="fade-up">
            <div className={styles.pageHeader} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h2 className={styles.pageTitle}>Monitoring Produk ED</h2>
                    <p className={styles.pageSubtitle}>
                        Apotek: <strong>{user?.name}</strong>
                        {lastUpdatedStr && (
                            <span style={{ marginLeft: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                · Diperbarui pukul {lastUpdatedStr}
                            </span>
                        )}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* ── Search Bar ── */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search
                            size={14}
                            style={{
                                position: 'absolute', left: '10px',
                                color: searchQuery ? 'var(--primary)' : 'var(--text-muted)',
                                pointerEvents: 'none', transition: 'color 0.15s'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Cari nama / kode produk..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                paddingLeft: '32px',
                                paddingRight: searchQuery ? '28px' : '12px',
                                height: '36px',
                                borderRadius: 'var(--radius-sm)',
                                border: `1.5px solid ${searchQuery ? 'var(--primary)' : 'var(--border)'}`,
                                background: 'var(--surface)',
                                fontSize: '0.82rem',
                                fontFamily: 'inherit',
                                color: 'var(--text-main)',
                                outline: 'none',
                                width: '220px',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                                boxShadow: searchQuery ? '0 0 0 3px var(--border-focus)' : 'none',
                            }}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--border-focus)'; }}
                            onBlur={e => { if (!searchQuery) { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; } }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                title="Hapus pencarian"
                                style={{
                                    position: 'absolute', right: '8px',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                                    padding: 0, lineHeight: 1
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleDownloadCSV}
                        disabled={loading || stocks.length === 0}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'transparent', border: '1.5px solid var(--primary)',
                            borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: 'var(--primary)', fontFamily: 'inherit',
                            transition: 'all 0.15s',
                            opacity: (loading || stocks.length === 0) ? 0.6 : 1,
                        }}
                    >
                        <Download size={14} />
                        Download CSV
                    </button>

                    <label
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'var(--primary)', border: '1.5px solid var(--primary)',
                            borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: 'white', fontFamily: 'inherit',
                            transition: 'all 0.15s',
                            opacity: loading ? 0.6 : 1,
                        }}
                    >
                        <Upload size={14} />
                        Mass Upload
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleUploadCSV}
                            style={{ display: 'none' }}
                            disabled={loading}
                        />
                    </label>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'var(--surface)', border: '1.5px solid var(--border)',
                            borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: 'var(--text-sub)', fontFamily: 'inherit',
                            transition: 'border-color 0.15s',
                            opacity: loading ? 0.6 : 1,
                        }}
                    >
                        <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Item</span>
                        <div className={`${styles.kpiIconWrap} ${styles.blue}`}><Package size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : totalItem}</div>
                    <div className={styles.kpiMeta}>Entri tercatat</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>ED Bulan Ini</span>
                        <div className={`${styles.kpiIconWrap} ${styles.red}`}><AlertTriangle size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : kritisCount}</div>
                    <div className={styles.kpiMeta}>Perlu segera ditangani</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>ED 1–3 Bulan</span>
                        <div className={`${styles.kpiIconWrap} ${styles.amber}`}><Calendar size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : nearCount}</div>
                    <div className={styles.kpiMeta}>Mendekati kedaluwarsa</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Sudah Ditarik</span>
                        <div className={`${styles.kpiIconWrap} ${styles.green}`}><CheckCircle2 size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loading ? '…' : terkumpulCount}</div>
                    <div className={styles.kpiMeta}>Status terkumpul</div>
                </div>
            </div>

            {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '40vh', gap: '16px' }}>
                    <Loader2 size={40} className="spinner" color="var(--primary)" />
                    <h3 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Memuat riwayat stok...</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Mohon tunggu, sedang memproses sinkronisasi produk.</p>
                </div>
            )}

            {!loading && error && (
                <div className={styles.section} style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--danger)' }}>
                    <AlertTriangle size={22} style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.875rem' }}>{error}</div>
                </div>
            )}

            {!loading && !error && stocks.length === 0 && (
                <div className={styles.section}>
                    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Inbox size={38} style={{ marginBottom: '12px', opacity: 0.35 }} />
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-sub)', marginBottom: '6px' }}>
                            Belum Ada Data Short ED
                        </div>
                        <div style={{ fontSize: '0.82rem' }}>
                            Gunakan menu <strong>Scan Barcode</strong> atau <strong>Input Manual</strong> untuk mulai melaporkan produk.
                        </div>
                    </div>
                </div>
            )}

            {/* ── No search result ── */}
            {!loading && !error && stocks.length > 0 && searchQuery.trim() && filteredStocks.length === 0 && (
                <div className={styles.section}>
                    <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Search size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-sub)', marginBottom: '4px' }}>
                            Produk tidak ditemukan
                        </div>
                        <div style={{ fontSize: '0.80rem' }}>
                            Tidak ada nama atau kode produk yang cocok dengan &ldquo;<strong>{searchQuery}</strong>&rdquo;
                        </div>
                    </div>
                </div>
            )}

            {/* ── Grouped Accordion Tables ── */}
            {!loading && !error && stocks.length > 0 && CATEGORIES.map(cat => {
                const items = grouped[cat.key];
                if (!items || items.length === 0) return null;

                const isOpen = derivedOpenPanels[cat.key];

                return (
                    <div key={cat.key} className={styles.section} style={{ marginBottom: '16px', overflow: 'hidden' }}>
                        {/* Arkodeon Header */}
                        <div
                            className={styles.sectionHeader}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}
                            onClick={() => togglePanel(cat.key)}
                        >
                            <span className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                {cat.label}
                                <span className={`${styles.badge} ${styles[cat.badge]}`}>
                                    {items.length} item
                                </span>
                                {searchQuery.trim() && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>
                                        (hasil pencarian)
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Arkodeon Body (Table) */}
                        {isOpen && (
                            <div className={styles.tableWrap} style={{ borderTop: '1px solid var(--border)' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Nama Produk</th>
                                            <th>Kode Produk</th>
                                            <th>Batch ID</th>
                                            <th>Tanggal ED</th>
                                            <th style={{ textAlign: 'right' }}>Qty</th>
                                            <th>Remark</th>
                                            <th>Rekomendasi</th>
                                            <th style={{ width: '80px', textAlign: 'center' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(s => {
                                            const months = monthsUntilED(s.ed_date);
                                            const rowStyle = cat.rowAlert || months < 0
                                                ? { background: 'rgba(220,38,38,0.03)' }
                                                : {};

                                            // Default nama fallback jika join gagal
                                            const itemName = s.master_products?.item_description || '(Tidak diketahui)';

                                            const isEditing = editingRowId === s.id;

                                            // Input styling for inline edit
                                            const inputStyle = {
                                                width: '100%', padding: '4px 6px',
                                                border: '1px solid var(--border)', borderRadius: '4px',
                                                fontSize: '0.85rem', fontFamily: 'inherit'
                                            };

                                            return (
                                                <tr key={s.id} style={rowStyle}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{itemName}</div>
                                                    </td>
                                                    <td>
                                                        <div className={styles.tdProduct}>{s.product_code}</div>
                                                    </td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                        {isEditing ? (
                                                            <input type="text" name="batchId" value={editForm.batchId} onChange={handleEditChange} style={{ ...inputStyle, textTransform: 'uppercase' }} />
                                                        ) : (
                                                            <div style={{ padding: '2px 0' }}>{s.batch_id || '—'}</div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="date" name="edDate" value={editForm.edDate} onChange={handleEditChange} style={inputStyle} />
                                                        ) : (
                                                            <div style={{ padding: '2px 0', fontWeight: 600, color: months <= 0 ? 'var(--danger)' : months <= 3 ? 'var(--warning)' : 'inherit' }}>
                                                                {formatDate(s.ed_date)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                        {isEditing ? (
                                                            <input type="number" name="qty" value={editForm.qty} onChange={handleEditChange} min="0" step="0.01" style={{ ...inputStyle, textAlign: 'right', minWidth: '60px' }} />
                                                        ) : (
                                                            <div style={{ padding: '2px 0' }}>{s.qty ?? '—'}</div>
                                                        )}
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '140px' }}>
                                                        {isEditing ? (
                                                            <input type="text" name="remark" value={editForm.remark} onChange={handleEditChange} style={inputStyle} />
                                                        ) : (
                                                            <div style={{ padding: '2px 0' }}>{s.remark || '—'}</div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '0.85rem', whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '150px' }}>
                                                        {getRekomendasi(s, cat.key, excludedCodes)}
                                                    </td>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {isEditing ? (
                                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                                {savingId === s.id ? (
                                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                                                                ) : (
                                                                    <>
                                                                        <button onClick={() => handleEditSave(s.id)} title="Simpan" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)' }}><Save size={16} /></button>
                                                                        <button onClick={handleEditCancel} title="Batal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><X size={16} /></button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => handleEditStart(s)} title="Edit Baris" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onMouseOver={e => e.currentTarget.style.color = 'var(--primary)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                                                <Edit2 size={16} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
