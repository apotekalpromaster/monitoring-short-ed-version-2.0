/**
 * OutletInputPage.jsx — Form Input Data Produk Short ED
 *
 * Fitur:
 *   1. Pencarian produk dari master_products dengan debounce 350ms
 *   2. Validasi procode_exclude sebelum submit
 *   3. Insert/Upsert ke stocks_ed (logika akumulasi qty jika unique_id sama)
 *   4. Fetch & tampilkan riwayat stok milik outlet yang login
 *   5. KPI dihitung dari data riwayat (bukan hardcode)
 *   6. Toast notifikasi murni CSS
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, X, ClipboardPen, Package, AlertTriangle,
    Calendar, Hash, Weight, AlignLeft, CheckCircle2, Loader2, Camera
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import {
    searchProducts,
    searchProductByBarcode,
    isProductExcluded,
    saveStockEntry,
    fetchOutletStocks,
} from '../services/outletService';
import BarcodeModal from '../components/BarcodeModal';
import styles from './OutletInputPage.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Hitung kategori ED produk berdasarkan tanggal hari ini. */
function getEdCategory(edDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ed = new Date(edDateStr);
    if (isNaN(ed)) return 'unknown';
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (ed < firstOfThisMonth) return 'terkumpul';
    const monthDiff = (ed.getFullYear() - today.getFullYear()) * 12 + (ed.getMonth() - today.getMonth());
    if (monthDiff === 0) return 'bulanIni';
    if (monthDiff >= 1 && monthDiff <= 3) return '1to3';
    if (monthDiff >= 4 && monthDiff <= 6) return '4to6';
    if (monthDiff >= 7 && monthDiff <= 12) return '7to12';
    return 'other';
}

const ED_CATEGORY_LABEL = {
    bulanIni: { label: 'ED Bulan Berjalan', badgeClass: 'badgeRed' },
    '1to3': { label: 'ED 1–3 Bulan', badgeClass: 'badgeAmber' },
    '4to6': { label: 'ED 4–6 Bulan', badgeClass: 'badgeBlue' },
    '7to12': { label: 'ED 7–12 Bulan', badgeClass: 'badgeBlue' },
    terkumpul: { label: 'Sudah Ditarik', badgeClass: 'badgeGray' },
    other: { label: '>12 Bulan', badgeClass: 'badgeGray' },
    unknown: { label: '—', badgeClass: 'badgeGray' },
};

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast Component
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 4000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    const cls = type === 'success' ? styles.toastSuccess
        : type === 'error' ? styles.toastError
            : styles.toastInfo;

    return (
        <div className={`${styles.toast} ${cls}`}>
            {type === 'success' ? <CheckCircle2 size={16} /> : type === 'error' ? <AlertTriangle size={16} /> : <Loader2 size={16} />}
            <span>{message}</span>
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'inherit' }}>
                <X size={14} />
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce hook
// ─────────────────────────────────────────────────────────────────────────────

function useDebounce(value, delay = 350) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { batchId: '', edDate: '', qty: '', remark: '' };

export default function OutletInputPage() {
    const user = useAuthStore((s) => s.user);

    // ── Form state ──
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null); // { product_code, description, uom }
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [searching, setSearching] = useState(false);

    // ── Monitoring state ──
    const [stocks, setStocks] = useState([]);
    const [loadingStocks, setLoadingStocks] = useState(true);

    // ── Toast ──
    const [toast, setToast] = useState(null); // { message, type }

    const searchRef = useRef(null);
    const batchRef = useRef(null);  // auto-focus ke Batch setelah scan
    const debouncedQuery = useDebounce(query, 350);

    // Physical scanner detection:
    // Scanner fisik bekerja seperti keystrokes sangat cepat (interval < 50ms) diakhiri Enter.
    const physicalScanBuffer = useRef('');
    const lastKeyTime = useRef(0);

    // Camera scanner state
    const [cameraScanOpen, setCameraScanOpen] = useState(false);

    // ── Fetch suggestions when query changes ──
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        let active = true;
        setSearching(true);
        setShowDropdown(true); // Tampilkan dropdown segera agar "Mencari..." terlihat

        searchProducts(debouncedQuery)
            .then((results) => {
                if (active) {
                    setSuggestions(results);
                    // Dropdown tetap true agar bisa menampilkan "Tidak ditemukan" jika empty
                }
            })
            .catch((err) => {
                console.error('Search error:', err);
                if (active) setSuggestions([]);
            })
            .finally(() => {
                if (active) setSearching(false);
            });

        return () => { active = false; };
    }, [debouncedQuery]);

    // ── Close dropdown on outside click ──
    useEffect(() => {
        function handler(e) {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Barcode scan result handler (camera & physical) ──
    async function handleBarcodeScanned(barcode) {
        setCameraScanOpen(false);
        showToast('Mencari produk...', 'info');
        try {
            const product = await searchProductByBarcode(barcode);
            if (product) {
                selectProduct(product);
                showToast(`Produk ditemukan: ${product.item_description}`, 'success');
                // Auto-focus ke kolom Batch setelah produk terpilih
                setTimeout(() => batchRef.current?.focus(), 80);
            } else {
                showToast(`Barcode "${barcode}" tidak terdaftar di Master Produk.`, 'error');
            }
        } catch (err) {
            showToast('Gagal mencari barcode: ' + err.message, 'error');
        }
    }

    // ── Physical barcode scanner detection ──
    // Scanner fisik mengirim keystrokes sangat cepat (< 50ms antar karakter) + Enter.
    function handleSearchKeyDown(e) {
        const now = Date.now();
        const timeDiff = now - lastKeyTime.current;
        lastKeyTime.current = now;

        if (e.key === 'Enter') {
            e.preventDefault();
            const buf = physicalScanBuffer.current;
            physicalScanBuffer.current = '';
            // Hanya proses sebagai barcode jika buffer terisi (>= 4 char)
            if (buf.length >= 4) {
                // input cepat = physical scanner, query by barcode
                handleBarcodeScanned(buf);
                setQuery('');
            }
        } else if (e.key.length === 1) {
            // Akumulasi buffer. Reset jika jeda > 100ms (user mengetik manual)
            if (timeDiff > 100) physicalScanBuffer.current = '';
            physicalScanBuffer.current += e.key;
        }
    }

    // ── Load riwayat stok outlet ──
    const loadStocks = useCallback(async () => {
        if (!user?.code) return;
        setLoadingStocks(true);
        try {
            const data = await fetchOutletStocks(user.code);
            setStocks(data);
        } catch (err) {
            showToast('Gagal memuat riwayat stok: ' + err.message, 'error');
        } finally {
            setLoadingStocks(false);
        }
    }, [user?.code]);

    useEffect(() => { loadStocks(); }, [loadStocks]);

    // ── Toast helper ──
    function showToast(message, type = 'info') {
        setToast({ message, type });
    }

    // ── Select product from dropdown ──
    function selectProduct(product) {
        setSelectedProduct(product);
        setQuery('');
        setSuggestions([]);
        setShowDropdown(false);
    }

    // ── Clear selected product ──
    function clearProduct() {
        setSelectedProduct(null);
        setQuery('');
    }

    // ── Form field change ──
    function handleFormChange(e) {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    }

    // ── Submit ──
    async function handleSubmit(e) {
        e.preventDefault();

        if (!selectedProduct) {
            showToast('Pilih produk dari daftar pencarian terlebih dahulu.', 'error');
            return;
        }
        if (!form.batchId.trim()) {
            showToast('Nomor Batch wajib diisi.', 'error');
            return;
        }
        if (!form.edDate) {
            showToast('Tanggal ED wajib diisi.', 'error');
            return;
        }
        if (!form.qty || parseFloat(form.qty) <= 0) {
            showToast('Qty harus lebih dari 0.', 'error');
            return;
        }

        // Hardcoded Period Validation: 1 Sep 2025 - 31 Mar 2027
        if (form.edDate < '2025-09-01' || form.edDate > '2027-03-31') {
            showToast('Tanggal ED di luar periode yang diizinkan (1 Sep 2025 - 31 Mar 2027).', 'error');
            return;
        }

        setSubmitting(true);
        showToast('Memeriksa produk...', 'info');

        try {
            // 1. Cek procode_exclude (logika validasi dari Code.gs)
            const excluded = await isProductExcluded(selectedProduct.product_code);
            if (excluded) {
                showToast(
                    `Produk ${selectedProduct.description} terdaftar dalam Daftar Pengecualian (Non-ED). Input tidak diizinkan.`,
                    'error'
                );
                setSubmitting(false);
                return;
            }

            // 2. Simpan ke stocks_ed (menggunakan barcode jika ada)
            const finalCodeToSave = selectedProduct.barcode || selectedProduct.product_code;
            await saveStockEntry({
                outletCode: user.code,
                productCode: finalCodeToSave,
                batchId: form.batchId,
                edDate: form.edDate,
                qty: form.qty,
                remark: form.remark,
            });

            showToast('Data berhasil disimpan!', 'success');

            // 3. Reset form
            setSelectedProduct(null);
            setForm(EMPTY_FORM);

            // 4. Reload riwayat
            await loadStocks();

        } catch (err) {
            showToast('Gagal menyimpan: ' + err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    // ── Compute KPI dari data riwayat ──
    const totalItem = stocks.length;
    const critisCount = stocks.filter(s => {
        const cat = getEdCategory(s.ed_date);
        return cat === 'bulanIni';
    }).length;
    const nearCount = stocks.filter(s => {
        const cat = getEdCategory(s.ed_date);
        return cat === '1to3';
    }).length;
    const terkumpulCount = stocks.filter(s => getEdCategory(s.ed_date) === 'terkumpul').length;

    // ── Kelompokkan stok per kategori ──
    const grouped = {};
    stocks.forEach(s => {
        const cat = getEdCategory(s.ed_date);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
    });

    const categoryOrder = ['terkumpul', 'bulanIni', '1to3', '4to6', '7to12', 'other'];

    return (
        <div className="fade-up">
            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => setToast(null)}
                />
            )}

            {/* Page Header */}
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Input Data Produk Short ED</h2>
                <p className={styles.pageSubtitle}>
                    Apotek: <strong>{user?.name}</strong>
                </p>
            </div>

            {/* KPI Cards — dihitung dari data riwayat */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Item</span>
                        <div className={`${styles.kpiIconWrap} ${styles.blue}`}><Package size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingStocks ? '…' : totalItem}</div>
                    <div className={styles.kpiMeta}>Entri tercatat</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>ED Bulan Ini</span>
                        <div className={`${styles.kpiIconWrap} ${styles.red}`}><AlertTriangle size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingStocks ? '…' : critisCount}</div>
                    <div className={styles.kpiMeta}>Perlu segera ditangani</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>ED 1–3 Bulan</span>
                        <div className={`${styles.kpiIconWrap} ${styles.amber}`}><Calendar size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingStocks ? '…' : nearCount}</div>
                    <div className={styles.kpiMeta}>Mendekati kedaluwarsa</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Sudah Ditarik</span>
                        <div className={`${styles.kpiIconWrap} ${styles.green}`}><CheckCircle2 size={15} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingStocks ? '…' : terkumpulCount}</div>
                    <div className={styles.kpiMeta}>Status terkumpul</div>
                </div>
            </div>

            {/* ── Input Form ── */}
            <div className={styles.formCard}>
                <div className={styles.formCardHeader}>
                    <ClipboardPen size={16} />
                    Input Data Baru
                </div>
                <div className={styles.formCardBody}>
                    <form onSubmit={handleSubmit} autoComplete="off">

                        {/* Product Search */}
                        {!selectedProduct ? (
                            <div className={styles.searchWrap} ref={searchRef}>
                                {/* Search icon */}
                                <Search size={16} className={styles.searchIcon} />

                                {/* Input: handles manual typing + physical barcode scanner */}
                                <input
                                    type="text"
                                    placeholder="Ketik nama produk atau scan barcode..."
                                    className={styles.searchInput}
                                    style={{ paddingRight: '46px' }}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    onFocus={() => query.length >= 2 && setShowDropdown(true)}
                                    onKeyDown={handleSearchKeyDown}
                                />

                                {/* Camera scanner button */}
                                <button
                                    type="button"
                                    onClick={() => setCameraScanOpen(true)}
                                    title="Scan dengan Kamera"
                                    style={{
                                        position: 'absolute', right: '10px', top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--primary)', padding: '4px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center',
                                        transition: 'opacity 0.15s',
                                    }}
                                >
                                    <Camera size={18} />
                                </button>

                                {showDropdown && (
                                    <div className={styles.dropdown}>
                                        {searching ? (
                                            <div className={styles.dropdownEmpty}>Mencari...</div>
                                        ) : suggestions.length === 0 ? (
                                            <div className={styles.dropdownEmpty}>Produk tidak ditemukan</div>
                                        ) : (
                                            suggestions.map(p => (
                                                <div
                                                    key={p.product_code}
                                                    className={styles.dropdownItem}
                                                    onMouseDown={() => selectProduct(p)}
                                                >
                                                    <span className={styles.dropdownItemName}>{p.item_description}</span>
                                                    <span className={styles.dropdownItemCode}>{p.barcode || p.product_code} · {p.uom}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={styles.selectedProduct}>
                                <div>
                                    <div className={styles.selectedProductName}>{selectedProduct.item_description}</div>
                                    <div className={styles.selectedProductCode}>
                                        {selectedProduct.barcode || selectedProduct.product_code} · {selectedProduct.uom}
                                    </div>
                                </div>
                                <button type="button" className={styles.clearBtn} onClick={clearProduct} title="Ganti produk">
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        {/* Detail Fields */}
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Hash size={11} /> Nomor Batch
                                </label>
                                <input
                                    type="text"
                                    name="batchId"
                                    ref={batchRef}
                                    value={form.batchId}
                                    onChange={handleFormChange}
                                    placeholder="Contoh: BN240901"
                                    className={styles.formInput}
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Calendar size={11} /> Tanggal ED
                                </label>
                                <input
                                    type="date"
                                    name="edDate"
                                    value={form.edDate}
                                    onChange={handleFormChange}
                                    className={styles.formInput}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Weight size={11} /> Qty Fisik
                                </label>
                                <input
                                    type="number"
                                    name="qty"
                                    value={form.qty}
                                    onChange={handleFormChange}
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    className={styles.formInput}
                                />
                            </div>

                            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                                <label className={styles.formLabel}>
                                    <AlignLeft size={11} /> Keterangan (Remark)
                                </label>
                                <textarea
                                    name="remark"
                                    value={form.remark}
                                    onChange={handleFormChange}
                                    placeholder="Opsional — catatan tambahan"
                                    className={styles.formTextarea}
                                    rows={2}
                                />
                            </div>
                        </div>

                        <button type="submit" className={styles.submitBtn} disabled={submitting || !selectedProduct}>
                            {submitting ? (
                                <>
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                    Menyimpan...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} />
                                    SIMPAN DATA
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* ── Camera Barcode Modal ── */}
            <BarcodeModal
                isOpen={cameraScanOpen}
                onScan={handleBarcodeScanned}
                onClose={() => setCameraScanOpen(false)}
            />

            {/* ── Monitoring Riwayat ── */}
            <div>
                {loadingStocks ? (
                    <div className={styles.section}>
                        <div className={styles.tableEmpty}>Memuat riwayat...</div>
                    </div>
                ) : stocks.length === 0 ? (
                    <div className={styles.section}>
                        <div className={styles.tableEmpty}>
                            Belum ada data stok Short ED tercatat untuk apotek ini.
                        </div>
                    </div>
                ) : (
                    categoryOrder.map(cat => {
                        const items = grouped[cat];
                        if (!items || items.length === 0) return null;
                        const meta = ED_CATEGORY_LABEL[cat] || { label: cat, badgeClass: 'badgeGray' };
                        return (
                            <div key={cat} className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <span className={styles.sectionTitle}>
                                        {meta.label}
                                        <span className={`${styles.badge} ${styles[meta.badgeClass]}`}>
                                            {items.length}
                                        </span>
                                    </span>
                                </div>
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Produk</th>
                                                <th>Batch</th>
                                                <th>Tgl ED</th>
                                                <th style={{ textAlign: 'right' }}>Qty</th>
                                                <th>Remark</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(s => (
                                                <tr key={s.id}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '2px' }}>
                                                            {s.master_products?.item_description || '(Tidak diketahui)'}
                                                        </div>
                                                        <div className={styles.tdProduct}>{s.product_code}</div>
                                                    </td>
                                                    <td>{s.batch_id}</td>
                                                    <td>{formatDate(s.ed_date)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.qty}</td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        {s.remark || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
