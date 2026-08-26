/**
 * OutletSalesPage.jsx — Form Pencatatan & Riwayat Penjualan Produk Short ED
 * Desain UI/UX Modern, Bersih, dan Responsif Mobile-First (Design System Apotek Alpro).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Receipt, Calendar, Hash, Package, DollarSign,
    CheckCircle2, AlertTriangle, Loader2, Download,
    RefreshCw, Search, X, TrendingUp, ShoppingBag,
    Layers, AlertCircle, ArrowRight
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchOutletStocks } from '../services/outletService';
import { recordShortEdSale, fetchOutletSales, exportSalesToExcel } from '../services/salesService';
import styles from './OutletSalesPage.module.css';

// ── Formatters ──
function fmtRp(val) {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTodayString() {
    return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthString() {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

export default function OutletSalesPage() {
    const user = useAuthStore(s => s.user);

    // ── Form State ──
    const [transactionDate, setTransactionDate] = useState(getTodayString());
    const [receiptNumber, setReceiptNumber] = useState('');
    const [productQuery, setProductQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null); // { product_code, name, uom, batches: [...] }
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [qty, setQty] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Toast Notification State ──
    const [toast, setToast] = useState(null); // { message, type }

    // ── Stocks & Sales Data State ──
    const [stocks, setStocks] = useState([]);
    const [sales, setSales] = useState([]);
    const [loadingStocks, setLoadingStocks] = useState(true);
    const [loadingSales, setLoadingSales] = useState(true);

    // ── Table Filters State ──
    const [periodFilter, setPeriodFilter] = useState('CURRENT_MONTH'); // 'CURRENT_MONTH', 'LAST_MONTH', 'ALL', 'CUSTOM'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [tableSearch, setTableSearch] = useState('');

    const searchWrapperRef = useRef(null);

    // ── 1. Load Data Stok Aktif Outlet ──
    const loadStocksData = useCallback(async () => {
        if (!user?.code) return;
        setLoadingStocks(true);
        try {
            const data = await fetchOutletStocks(user.code);
            const today = new Date();
            const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

            // Filter: Hanya stok dengan qty > 0 dan ED >= awal bulan berjalan
            const activeStocks = (data || []).filter(s => {
                const stockQty = parseFloat(s.qty) || 0;
                const isNotWithdrawn = s.ed_date >= firstOfThisMonth;
                return stockQty > 0 && isNotWithdrawn;
            });
            setStocks(activeStocks);
        } catch (err) {
            console.error('Gagal memuat stok outlet:', err);
        } finally {
            setLoadingStocks(false);
        }
    }, [user?.code]);

    // ── 2. Load Data Riwayat Penjualan ──
    const loadSalesData = useCallback(async () => {
        if (!user?.code) return;
        setLoadingSales(true);
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

            const data = await fetchOutletSales(user.code, filterObj);
            setSales(data);
        } catch (err) {
            setToast({ message: 'Gagal memuat riwayat penjualan: ' + err.message, type: 'error' });
        } finally {
            setLoadingSales(false);
        }
    }, [user?.code, periodFilter, customStartDate, customEndDate]);

    useEffect(() => {
        loadStocksData();
    }, [loadStocksData]);

    useEffect(() => {
        loadSalesData();
    }, [loadSalesData]);

    // Tutup dropdown jika klik di luar area autocomplete
    useEffect(() => {
        function handleClickOutside(e) {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
                setProductDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── 3. Grouping Master Data Produk dari Stok Aktif ──
    const availableProducts = useMemo(() => {
        const map = {};
        stocks.forEach(s => {
            const code = String(s.product_code || '').trim();
            const name = s.master_products?.item_description || code;
            if (!map[code]) {
                map[code] = {
                    product_code: code,
                    name: name,
                    uom: s.master_products?.uom || 'Pcs',
                    suggestedPrice: s.master_products?.price_discounted || s.master_products?.price_non_member || '',
                    batches: []
                };
            }
            map[code].batches.push({
                stock_ed_id: s.id,
                batch_id: s.batch_id,
                ed_date: s.ed_date,
                qty: parseFloat(s.qty) || 0,
                remark: s.remark
            });
        });
        return Object.values(map);
    }, [stocks]);

    // ── 4. Suggestions untuk Autocomplete Nama / Kode Produk ──
    const filteredProductSuggestions = useMemo(() => {
        if (!productQuery || productQuery.trim().length < 1) return [];
        const q = productQuery.trim().toLowerCase();
        return availableProducts.filter(p =>
            p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q)
        ).slice(0, 15);
    }, [availableProducts, productQuery]);

    // ── 5. Handler Pilih Produk ──
    const handleSelectProduct = (prod) => {
        setSelectedProduct(prod);
        setProductQuery('');
        setProductDropdownOpen(false);

        if (prod.batches.length === 1) {
            setSelectedBatchId(prod.batches[0].batch_id);
        } else {
            setSelectedBatchId('');
        }

        if (prod.suggestedPrice && !unitPrice) {
            setUnitPrice(prod.suggestedPrice);
        }
    };

    // ── Handler Scan / Input Kode Produk Manual ──
    const handleProductCodeInput = (codeVal) => {
        const clean = codeVal.trim();
        if (!clean) return;
        const matched = availableProducts.find(p => p.product_code.toLowerCase() === clean.toLowerCase());
        if (matched) {
            handleSelectProduct(matched);
        }
    };

    // ── Batch Terpilih ──
    const selectedBatchInfo = useMemo(() => {
        if (!selectedProduct || !selectedBatchId) return null;
        return selectedProduct.batches.find(b => b.batch_id === selectedBatchId) || null;
    }, [selectedProduct, selectedBatchId]);

    // ── Kalkulasi Total Penjualan ──
    const calculatedTotal = useMemo(() => {
        const q = parseFloat(qty) || 0;
        const p = parseFloat(unitPrice) || 0;
        return q * p;
    }, [qty, unitPrice]);

    // ── Validasi Form ──
    const isQtyExceeded = useMemo(() => {
        if (!selectedBatchInfo) return false;
        const q = parseFloat(qty) || 0;
        return q > selectedBatchInfo.qty;
    }, [selectedBatchInfo, qty]);

    // ── 6. Handler Submit Penjualan ──
    const handleSubmitSale = async (e) => {
        e.preventDefault();

        if (!transactionDate) {
            setToast({ message: 'Tanggal transaksi wajib diisi.', type: 'error' });
            return;
        }
        if (!receiptNumber.trim()) {
            setToast({ message: 'Nomor struk kasir wajib diisi.', type: 'error' });
            return;
        }
        if (!selectedProduct) {
            setToast({ message: 'Pilih produk Short ED yang dijual terlebih dahulu.', type: 'error' });
            return;
        }
        if (!selectedBatchId || !selectedBatchInfo) {
            setToast({ message: 'Pilih nomor batch produk.', type: 'error' });
            return;
        }
        const numericQty = parseFloat(qty);
        if (isNaN(numericQty) || numericQty <= 0) {
            setToast({ message: 'Jumlah terjual (Qty) harus lebih dari 0.', type: 'error' });
            return;
        }
        if (numericQty > selectedBatchInfo.qty) {
            setToast({ message: `Jumlah terjual (${numericQty}) melebihi sisa stok (${selectedBatchInfo.qty}).`, type: 'error' });
            return;
        }
        const numericPrice = parseFloat(unitPrice);
        if (isNaN(numericPrice) || numericPrice < 0) {
            setToast({ message: 'Harga satuan (Rp) harus diisi dan tidak boleh negatif.', type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            const res = await recordShortEdSale({
                outletCode: user.code,
                stockEdId: selectedBatchInfo.stock_ed_id,
                transactionDate: transactionDate,
                receiptNumber: receiptNumber.trim(),
                productCode: selectedProduct.product_code,
                batchId: selectedBatchId,
                edDate: selectedBatchInfo.ed_date,
                qty: numericQty,
                unitPrice: numericPrice,
                createdBy: user.name || user.code
            });

            setToast({
                message: `✅ Penjualan ${selectedProduct.name} (${numericQty} item) berhasil disimpan! Sisa stok: ${res.remainingStock}.`,
                type: 'success'
            });

            // Reset form produk yang baru terjual (simpan tanggal dan struk agar kasir cepat input item berikutnya)
            setSelectedProduct(null);
            setSelectedBatchId('');
            setQty('');
            setUnitPrice('');

            // Muat ulang stok dan tabel riwayat
            loadStocksData();
            loadSalesData();
        } catch (err) {
            setToast({ message: 'Gagal mencatat penjualan: ' + err.message, type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // ── 7. Filter & Search Tabel Riwayat ──
    const filteredSales = useMemo(() => {
        if (!tableSearch.trim()) return sales;
        const q = tableSearch.trim().toLowerCase();
        return sales.filter(s => {
            const name = (s.master_products?.item_description || '').toLowerCase();
            const code = (s.product_code || '').toLowerCase();
            const receipt = (s.receipt_number || '').toLowerCase();
            const batch = (s.batch_id || '').toLowerCase();
            return name.includes(q) || code.includes(q) || receipt.includes(q) || batch.includes(q);
        });
    }, [sales, tableSearch]);

    // ── 8. Agregasi Grand Total & KPI ──
    const { totalItemsSold, totalRevenue, totalReceiptsCount } = useMemo(() => {
        let itemsCount = 0;
        let revenue = 0;
        const receiptsSet = new Set();

        filteredSales.forEach(s => {
            const q = parseFloat(s.qty) || 0;
            const p = parseFloat(s.total_price) || (q * (parseFloat(s.unit_price) || 0));
            itemsCount += q;
            revenue += p;
            if (s.receipt_number) receiptsSet.add(s.receipt_number);
        });

        return {
            totalItemsSold: itemsCount,
            totalRevenue: revenue,
            totalReceiptsCount: receiptsSet.size
        };
    }, [filteredSales]);

    // ── 9. Handler Download Excel ──
    const handleDownloadExcel = () => {
        if (!filteredSales || filteredSales.length === 0) {
            alert('Tidak ada data penjualan pada periode ini untuk diunduh.');
            return;
        }
        exportSalesToExcel(filteredSales, {
            fileName: `Penjualan_Short_ED_${user?.code}`,
            isMultiOutlet: false
        });
    };

    return (
        <div className="fade-up">
            {/* Toast Notification */}
            {toast && (
                <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
                    {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    <div style={{ flex: 1 }}>{toast.message}</div>
                    <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>Penjualan Produk Short ED</h2>
                    <p className={styles.pageSubtitle}>
                        Apotek: <strong>{user?.name || user?.code}</strong> · Catat transaksi penjualan untuk otomatis memperbarui sisa stok
                    </p>
                </div>

                <button
                    onClick={() => { loadStocksData(); loadSalesData(); }}
                    disabled={loadingSales || loadingStocks}
                    className={styles.btnRefresh}
                >
                    <RefreshCw size={14} style={(loadingSales || loadingStocks) ? { animation: 'spin 1s linear infinite' } : {}} />
                    Segarkan Data
                </button>
            </div>

            {/* KPI Cards Ringkasan */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Terjual</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconBlue}`}><ShoppingBag size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingSales ? '…' : totalItemsSold}</div>
                    <div className={styles.kpiMeta}>Pcs / Box keluar</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Omzet Penjualan</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconGreen}`}><TrendingUp size={16} /></div>
                    </div>
                    <div className={styles.kpiValue} style={{ color: 'var(--success)' }}>
                        {loadingSales ? '…' : fmtRp(totalRevenue)}
                    </div>
                    <div className={styles.kpiMeta}>Nilai penjualan terealisasi</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Struk Kasir</span>
                        <div className={`${styles.kpiIconWrap} ${styles.iconAmber}`}><Receipt size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>{loadingSales ? '…' : totalReceiptsCount}</div>
                    <div className={styles.kpiMeta}>Nomor transaksi tercatat</div>
                </div>
            </div>

            {/* ── FORM INPUT TRANSAKSI PENJUALAN ── */}
            <div className={styles.formCard}>
                <div className={styles.formCardHeader}>
                    <div className={styles.formCardTitle}>
                        <Receipt size={18} color="var(--primary)" />
                        Form Input Penjualan Short ED
                    </div>
                    <div className={styles.badgeCount}>
                        {availableProducts.length} produk siap dijual
                    </div>
                </div>

                <div className={styles.formCardBody}>
                    <form onSubmit={handleSubmitSale}>
                        {/* Baris 1: Informasi Struk */}
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Calendar size={14} className={styles.formLabelIcon} />
                                    Tanggal Transaksi <span className={styles.requiredStar}>*</span>
                                </label>
                                <input
                                    type="date"
                                    className={styles.formInput}
                                    value={transactionDate}
                                    onChange={e => setTransactionDate(e.target.value)}
                                    required
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Receipt size={14} className={styles.formLabelIcon} />
                                    Nomor Struk Kasir <span className={styles.requiredStar}>*</span>
                                </label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    placeholder="Contoh: STR-00129 / 10294"
                                    value={receiptNumber}
                                    onChange={e => setReceiptNumber(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {/* Baris 2: Pencarian & Autocomplete Produk */}
                        <div className={styles.formGrid}>
                            {/* Lookup Nama Produk */}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Package size={14} className={styles.formLabelIcon} />
                                    Nama Produk (Lookup Stok Aktif) <span className={styles.requiredStar}>*</span>
                                </label>

                                <div className={styles.searchWrapper} ref={searchWrapperRef}>
                                    <Search size={15} className={styles.searchIconLeft} />
                                    <input
                                        type="text"
                                        className={styles.searchInput}
                                        placeholder="Ketik nama atau kode obat..."
                                        value={productQuery}
                                        onChange={e => {
                                            setProductQuery(e.target.value);
                                            setProductDropdownOpen(true);
                                        }}
                                        onFocus={() => setProductDropdownOpen(true)}
                                    />
                                    {productQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setProductQuery('')}
                                            className={styles.clearSearchBtn}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}

                                    {/* Dropdown Hasil Pencarian */}
                                    {productDropdownOpen && filteredProductSuggestions.length > 0 && (
                                        <div className={styles.dropdownMenu}>
                                            {filteredProductSuggestions.map(p => (
                                                <div
                                                    key={p.product_code}
                                                    onClick={() => handleSelectProduct(p)}
                                                    className={styles.dropdownItem}
                                                >
                                                    <div className={styles.dropdownItemName}>{p.name}</div>
                                                    <div className={styles.dropdownItemMeta}>
                                                        <span>Kode: <code>{p.product_code}</code></span>
                                                        <span>·</span>
                                                        <span>{p.batches.length} batch tersedia</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Scan / Input Kode Produk Manual */}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Hash size={14} className={styles.formLabelIcon} />
                                    Kode Produk / Barcode
                                </label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    placeholder="Scan barcode atau ketik kode..."
                                    value={selectedProduct ? selectedProduct.product_code : ''}
                                    onChange={e => handleProductCodeInput(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Banner Produk Terpilih */}
                        {selectedProduct && (
                            <div className={styles.selectedProductBanner}>
                                <div className={styles.selectedProductInfo}>
                                    <div className={styles.selectedProductName}>{selectedProduct.name}</div>
                                    <div className={styles.selectedProductDetails}>
                                        <span>Kode: <code>{selectedProduct.product_code}</code></span>
                                        <span>·</span>
                                        <span>Satuan: <strong>{selectedProduct.uom}</strong></span>
                                        <span>·</span>
                                        <span>{selectedProduct.batches.length} batch aktif</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedProduct(null); setSelectedBatchId(''); }}
                                    className={styles.btnChangeProduct}
                                >
                                    Ganti Produk
                                </button>
                            </div>
                        )}

                        {/* Baris 3: Detail Batch, Qty, dan Harga */}
                        <div className={styles.formGrid3} style={{ marginTop: '16px' }}>
                            {/* Pilihan Nomor Batch */}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Layers size={14} className={styles.formLabelIcon} />
                                    Nomor Batch <span className={styles.requiredStar}>*</span>
                                </label>
                                <select
                                    className={styles.formSelect}
                                    value={selectedBatchId}
                                    onChange={e => setSelectedBatchId(e.target.value)}
                                    disabled={!selectedProduct || selectedProduct.batches.length === 0}
                                    required
                                >
                                    <option value="">-- Pilih Batch --</option>
                                    {selectedProduct?.batches.map(b => (
                                        <option key={b.stock_ed_id || b.batch_id} value={b.batch_id}>
                                            {b.batch_id} (ED: {formatDate(b.ed_date)} | Sisa: {b.qty})
                                        </option>
                                    ))}
                                </select>
                                {selectedBatchInfo ? (
                                    <div className={styles.helperText}>
                                        Sisa stok: <strong>{selectedBatchInfo.qty} {selectedProduct?.uom || 'Pcs'}</strong>
                                    </div>
                                ) : (
                                    <div className={styles.helperText}>Pilih produk terlebih dahulu</div>
                                )}
                            </div>

                            {/* Jumlah Terjual (Qty) */}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <ShoppingBag size={14} className={styles.formLabelIcon} />
                                    Jumlah Terjual (Qty) <span className={styles.requiredStar}>*</span>
                                </label>
                                <input
                                    type="number"
                                    className={`${styles.formInput} ${isQtyExceeded ? styles.formInputError : ''}`}
                                    placeholder="0"
                                    min="0.01"
                                    step="any"
                                    max={selectedBatchInfo?.qty || undefined}
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    required
                                />
                                {isQtyExceeded ? (
                                    <div className={styles.errorText}>
                                        Melebihi sisa stok (Maks: {selectedBatchInfo.qty})
                                    </div>
                                ) : selectedBatchInfo ? (
                                    <div className={styles.helperText}>Maksimal: {selectedBatchInfo.qty} {selectedProduct?.uom}</div>
                                ) : null}
                            </div>

                            {/* Harga Satuan (Rp) */}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <DollarSign size={14} className={styles.formLabelIcon} />
                                    Harga Satuan (Rp) <span className={styles.requiredStar}>*</span>
                                </label>
                                <input
                                    type="number"
                                    className={styles.formInput}
                                    placeholder="Contoh: 15000"
                                    min="0"
                                    step="any"
                                    value={unitPrice}
                                    onChange={e => setUnitPrice(e.target.value)}
                                    required
                                />
                                <div className={styles.helperText}>Harga riil sesuai struk kasir</div>
                            </div>
                        </div>

                        {/* Order Calculation Summary Card & Submit Button */}
                        <div className={styles.orderSummaryCard}>
                            <div>
                                <div className={styles.summaryTotalLabel}>Total Nilai Penjualan</div>
                                <div className={styles.summaryTotalAmount}>{fmtRp(calculatedTotal)}</div>
                                <div className={styles.summaryTotalFormula}>
                                    {qty && unitPrice ? `${qty} item × ${fmtRp(unitPrice)}` : 'Kalkulasi otomatis (Qty × Harga Satuan)'}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting || isQtyExceeded || !selectedProduct || !selectedBatchId}
                                className={styles.submitBtn}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                        Menyimpan Penjualan...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} />
                                        Catat Penjualan & Potong Stok
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* ── TABEL RIWAYAT PENJUALAN APOTEK ── */}
            <div className={styles.tableSection}>
                <div className={styles.tableToolbar}>
                    <div>
                        <div className={styles.tableTitle}>Riwayat Penjualan Produk Short ED</div>
                        <div className={styles.tableSubtitle}>
                            Daftar transaksi penjualan yang telah tercatat dan memotong stok
                        </div>
                    </div>

                    <div className={styles.toolbarControls}>
                        {/* Pilihan Periode */}
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

                        {/* Custom Date Inputs */}
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

                        {/* Search Riwayat */}
                        <div className={styles.toolbarSearch}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Cari nama, struk, batch..."
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

                        {/* Tombol Unduh Excel */}
                        <button
                            onClick={handleDownloadExcel}
                            disabled={loadingSales || filteredSales.length === 0}
                            className={styles.btnDownload}
                        >
                            <Download size={15} />
                            Unduh Excel (.xlsx)
                        </button>
                    </div>
                </div>

                {/* Table Body */}
                <div className={styles.tableWrap}>
                    {loadingSales ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', color: 'var(--primary)' }} />
                            <div>Memuat riwayat transaksi...</div>
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Belum ada transaksi penjualan short ED pada periode yang dipilih.
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
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
                                            {s.created_at ? new Date(s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className={styles.tableFooterRow}>
                                    <td colSpan={6} style={{ textAlign: 'right' }}>
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
