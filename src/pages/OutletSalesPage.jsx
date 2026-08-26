/**
 * OutletSalesPage.jsx — Form Pencatatan & Riwayat Penjualan Produk Short ED
 * Desain POS 2-Kolom Modern: Input di Kiri, Struk Aktif di Kanan, Riwayat di Bawah.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Receipt, Calendar, Hash, Package, Tag,
    CheckCircle2, AlertTriangle, Loader2, Download,
    RefreshCw, Search, X, TrendingUp, ShoppingBag,
    Layers, Plus, Trash2, ShoppingCart, ArrowRight
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchOutletStocks } from '../services/outletService';
import { recordBulkShortEdSales, fetchOutletSales, exportSalesToExcel } from '../services/salesService';
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

    // ── Struk Header State ──
    const [transactionDate, setTransactionDate] = useState(getTodayString());
    const [receiptNumber, setReceiptNumber] = useState('');

    // ── Current Item Input State ──
    const [productQuery, setProductQuery] = useState('');
    const [barcodeQuery, setBarcodeQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null); // { product_code, name, uom, batches: [...] }
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [qty, setQty] = useState('');
    const [unitPrice, setUnitPrice] = useState('');

    // ── Live Receipt Cart State ──
    const [cartItems, setCartItems] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // ── Toast Notification State ──
    const [toast, setToast] = useState(null); // { message, type }

    // ── Stocks & Sales History State ──
    const [stocks, setStocks] = useState([]);
    const [sales, setSales] = useState([]);
    const [loadingStocks, setLoadingStocks] = useState(true);
    const [loadingSales, setLoadingSales] = useState(true);

    // ── Table Filters State ──
    const [periodFilter, setPeriodFilter] = useState('CURRENT_MONTH');
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

    // Tutup dropdown autocomplete jika klik di luar
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
            const barcode = String(s.master_products?.barcode || s.product_code || '').trim();

            if (!map[code]) {
                map[code] = {
                    product_code: code,
                    barcode: barcode,
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

    // ── 4. Suggestions Autocomplete ──
    const filteredProductSuggestions = useMemo(() => {
        if (!productQuery || productQuery.trim().length < 1) return [];
        const q = productQuery.trim().toLowerCase();
        return availableProducts.filter(p =>
            p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q))
        ).slice(0, 15);
    }, [availableProducts, productQuery]);

    // ── 5. Handler Pilih Produk dari Dropdown ──
    const handleSelectProduct = (prod) => {
        setSelectedProduct(prod);
        setProductQuery('');
        setBarcodeQuery(prod.product_code);
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

    // ── 6. Handler Ketik / Scan Barcode (Bebas Ketik & Reaktif) ──
    const handleBarcodeChange = (val) => {
        setBarcodeQuery(val);
        const clean = val.trim().toLowerCase();
        if (!clean) {
            setSelectedProduct(null);
            setSelectedBatchId('');
            return;
        }

        const matched = availableProducts.find(p =>
            p.product_code.toLowerCase() === clean || (p.barcode && p.barcode.toLowerCase() === clean)
        );

        if (matched) {
            setSelectedProduct(matched);
            if (matched.batches.length === 1) {
                setSelectedBatchId(matched.batches[0].batch_id);
            }
            if (matched.suggestedPrice && !unitPrice) {
                setUnitPrice(matched.suggestedPrice);
            }
        }
    };

    // ── Batch Terpilih ──
    const selectedBatchInfo = useMemo(() => {
        if (!selectedProduct || !selectedBatchId) return null;
        return selectedProduct.batches.find(b => b.batch_id === selectedBatchId) || null;
    }, [selectedProduct, selectedBatchId]);

    // ── Sisa Stok Tersedia (Dikurangi Item yang Sedang Berada di Struk Aktif) ──
    const alreadyInCartQty = useMemo(() => {
        if (!selectedProduct || !selectedBatchId) return 0;
        return cartItems
            .filter(item => item.productCode === selectedProduct.product_code && item.batchId === selectedBatchId)
            .reduce((acc, item) => acc + item.qty, 0);
    }, [cartItems, selectedProduct, selectedBatchId]);

    const effectiveRemainingStock = useMemo(() => {
        if (!selectedBatchInfo) return 0;
        return Math.max(0, selectedBatchInfo.qty - alreadyInCartQty);
    }, [selectedBatchInfo, alreadyInCartQty]);

    const isQtyExceeded = useMemo(() => {
        if (!selectedBatchInfo) return false;
        const q = parseFloat(qty) || 0;
        return q > effectiveRemainingStock;
    }, [selectedBatchInfo, effectiveRemainingStock, qty]);

    const calculatedItemSubtotal = useMemo(() => {
        const q = parseFloat(qty) || 0;
        const p = parseFloat(unitPrice) || 0;
        return q * p;
    }, [qty, unitPrice]);

    // ── 7. Handler Tambah Item ke Struk ──
    const handleAddToCart = (e) => {
        e.preventDefault();

        if (!selectedProduct) {
            setToast({ message: 'Pilih obat Short ED yang dijual terlebih dahulu.', type: 'error' });
            return;
        }
        if (!selectedBatchId || !selectedBatchInfo) {
            setToast({ message: 'Pilih nomor batch obat.', type: 'error' });
            return;
        }
        const numericQty = parseFloat(qty);
        if (isNaN(numericQty) || numericQty <= 0) {
            setToast({ message: 'Jumlah terjual (Qty) harus lebih dari 0.', type: 'error' });
            return;
        }
        if (numericQty > effectiveRemainingStock) {
            setToast({ message: `Jumlah terjual (${numericQty}) melebihi sisa stok yang tersedia (${effectiveRemainingStock}).`, type: 'error' });
            return;
        }
        const numericPrice = parseFloat(unitPrice);
        if (isNaN(numericPrice) || numericPrice < 0) {
            setToast({ message: 'Harga satuan (Rp) harus diisi dan tidak boleh negatif.', type: 'error' });
            return;
        }

        const subtotal = Math.round(numericQty * numericPrice * 100) / 100;
        const newItem = {
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            stockEdId: selectedBatchInfo.stock_ed_id,
            productCode: selectedProduct.product_code,
            productName: selectedProduct.name,
            batchId: selectedBatchId,
            edDate: selectedBatchInfo.ed_date,
            qty: numericQty,
            unitPrice: numericPrice,
            totalPrice: subtotal,
            uom: selectedProduct.uom,
            maxQty: selectedBatchInfo.qty
        };

        setCartItems(prev => [...prev, newItem]);

        // Reset input item obat
        setSelectedProduct(null);
        setBarcodeQuery('');
        setProductQuery('');
        setSelectedBatchId('');
        setQty('');
        setUnitPrice('');

        setToast({ message: `✓ ${newItem.productName} (${numericQty} ${newItem.uom}) ditambahkan ke struk.`, type: 'success' });
    };

    // ── 8. Handler Hapus Item dari Struk ──
    const handleRemoveFromCart = (itemId) => {
        setCartItems(prev => prev.filter(item => item.id !== itemId));
    };

    // ── 9. Total Keseluruhan Struk Aktif ──
    const { cartTotalQty, cartGrandTotal } = useMemo(() => {
        let totalQ = 0;
        let totalRp = 0;
        cartItems.forEach(item => {
            totalQ += item.qty;
            totalRp += item.totalPrice;
        });
        return { cartTotalQty: totalQ, cartGrandTotal: totalRp };
    }, [cartItems]);

    // ── 10. Handler Submit Semua Item dalam Struk ──
    const handleSubmitReceipt = async () => {
        if (!transactionDate) {
            setToast({ message: 'Tanggal transaksi wajib diisi.', type: 'error' });
            return;
        }
        if (!receiptNumber.trim()) {
            setToast({ message: 'Nomor struk kasir wajib diisi.', type: 'error' });
            return;
        }
        if (cartItems.length === 0) {
            setToast({ message: 'Belum ada obat yang dimasukkan ke dalam struk ini.', type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            await recordBulkShortEdSales({
                outletCode: user.code,
                transactionDate: transactionDate,
                receiptNumber: receiptNumber.trim(),
                items: cartItems,
                createdBy: user.name || user.code
            });

            setToast({
                message: `✅ Struk #${receiptNumber.trim()} berhasil disimpan! (${cartItems.length} item, Total: ${fmtRp(cartGrandTotal)})`,
                type: 'success'
            });

            // Kosongkan keranjang & siapkan struk berikutnya
            setCartItems([]);
            setReceiptNumber('');

            // Muat ulang stok aktif dan tabel riwayat
            loadStocksData();
            loadSalesData();
        } catch (err) {
            setToast({ message: 'Gagal menyimpan transaksi struk: ' + err.message, type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // ── 11. Filter & Search Riwayat ──
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

    // ── 12. Agregasi Riwayat & KPI ──
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

    // ── 13. Download Excel ──
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
                        Apotek: <strong>{user?.name || user?.code}</strong> · Catat transaksi penjualan per struk kasir untuk otomatis memotong stok monitoring
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

            {/* ── ARSITEKTUR POS 2-KOLOM (SPLIT LAYOUT) ── */}
            <div className={styles.splitLayout}>
                {/* ── KOLOM KIRI: FORM INPUT STRUK & TAMBAH OBAT ── */}
                <div className={styles.leftPane}>
                    {/* Card 1: Data Struk Kasir */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <Receipt size={16} color="var(--primary)" />
                                1. Informasi Struk Kasir
                            </div>
                        </div>

                        <div className={styles.cardBody}>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
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
                        </div>
                    </div>

                    {/* Card 2: Form Tambah Item Obat ke Struk */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <Package size={16} color="var(--primary)" />
                                2. Tambah Obat ke Struk
                            </div>
                            <span className={styles.badgePill}>
                                {availableProducts.length} produk aktif
                            </span>
                        </div>

                        <div className={styles.cardBody}>
                            <form onSubmit={handleAddToCart}>
                                <div className={styles.formGridFull}>
                                    {/* Scan / Ketik Kode Produk / Barcode */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Hash size={13} />
                                            Kode Produk / Barcode (Scan / Ketik)
                                        </label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            placeholder="Scan barcode atau ketik kode..."
                                            value={barcodeQuery}
                                            onChange={e => handleBarcodeChange(e.target.value)}
                                        />
                                    </div>

                                    {/* Lookup Nama Obat */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Search size={13} />
                                            Pencarian Nama Obat (Lookup Stok)
                                        </label>
                                        <div className={styles.searchWrapper} ref={searchWrapperRef}>
                                            <Search size={14} className={styles.searchIconLeft} />
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
                                                    <X size={13} />
                                                </button>
                                            )}

                                            {/* Dropdown Suggestions */}
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
                                            onClick={() => { setSelectedProduct(null); setBarcodeQuery(''); setSelectedBatchId(''); }}
                                            className={styles.btnChangeProduct}
                                        >
                                            Ganti
                                        </button>
                                    </div>
                                )}

                                {/* Pilihan Batch, Qty & Harga Satuan */}
                                <div className={styles.formGridFull} style={{ marginTop: '12px' }}>
                                    {/* Nomor Batch */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Layers size={13} />
                                            Nomor Batch <span className={styles.requiredStar}>*</span>
                                        </label>
                                        <select
                                            className={styles.formSelect}
                                            value={selectedBatchId}
                                            onChange={e => setSelectedBatchId(e.target.value)}
                                            disabled={!selectedProduct || selectedProduct.batches.length === 0}
                                            required
                                        >
                                            <option value="">-- Pilih Batch Obat --</option>
                                            {selectedProduct?.batches.map(b => (
                                                <option key={b.stock_ed_id || b.batch_id} value={b.batch_id}>
                                                    {b.batch_id} (ED: {formatDate(b.ed_date)} | Sisa: {b.qty})
                                                </option>
                                            ))}
                                        </select>
                                        {selectedBatchInfo ? (
                                            <div className={styles.helperText}>
                                                Sisa stok tersedia: <strong>{effectiveRemainingStock} {selectedProduct?.uom || 'Pcs'}</strong>
                                                {alreadyInCartQty > 0 && ` (${alreadyInCartQty} sudah di struk)`}
                                            </div>
                                        ) : (
                                            <div className={styles.helperText}>Pilih produk terlebih dahulu</div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.formGrid} style={{ marginTop: '12px' }}>
                                    {/* Qty Terjual */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            Jumlah (Qty) <span className={styles.requiredStar}>*</span>
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.formInput} ${isQtyExceeded ? styles.formInputError : ''}`}
                                            placeholder="0"
                                            min="0.01"
                                            step="any"
                                            max={effectiveRemainingStock || undefined}
                                            value={qty}
                                            onChange={e => setQty(e.target.value)}
                                            required
                                        />
                                        {isQtyExceeded ? (
                                            <div className={styles.errorText}>
                                                Maksimal {effectiveRemainingStock} {selectedProduct?.uom}
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Harga Satuan (Prefix Rp) */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            Harga Satuan (Rp) <span className={styles.requiredStar}>*</span>
                                        </label>
                                        <div className={styles.pricePrefixGroup}>
                                            <span className={styles.pricePrefix}>Rp</span>
                                            <input
                                                type="number"
                                                className={`${styles.formInput} ${styles.inputWithPrefix}`}
                                                placeholder="15000"
                                                min="0"
                                                step="any"
                                                value={unitPrice}
                                                onChange={e => setUnitPrice(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Live Item Subtotal Preview Bar */}
                                {qty && unitPrice ? (
                                    <div className={styles.itemSubtotalBanner}>
                                        <span className={styles.itemSubtotalLabel}>Subtotal Obat Ini:</span>
                                        <span className={styles.itemSubtotalValue}>{fmtRp(calculatedItemSubtotal)}</span>
                                    </div>
                                ) : null}

                                {/* Tombol Tambah ke Struk (Full Width CTA) */}
                                <button
                                    type="submit"
                                    disabled={!selectedProduct || !selectedBatchId || isQtyExceeded || !qty || !unitPrice}
                                    className={styles.btnAddItem}
                                >
                                    <Plus size={16} />
                                    Tambah ke Struk
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* ── KOLOM KANAN: LIVE RECEIPT & CHECKOUT PANEL ── */}
                <div className={styles.rightPane}>
                    <div className={styles.receiptCard}>
                        <div className={styles.receiptHeader}>
                            <div className={styles.receiptTitle}>
                                <ShoppingCart size={17} color="var(--primary)" />
                                Struk Aktif: <strong>#{receiptNumber || '—'}</strong>
                            </div>
                            <span className={styles.badgePill}>
                                {cartItems.length} Item Obat
                            </span>
                        </div>

                        {/* Tabel Item dalam Struk */}
                        <div className={styles.receiptTableWrap}>
                            {cartItems.length === 0 ? (
                                <div className={styles.receiptEmptyState}>
                                    <div className={styles.receiptEmptyIcon}>
                                        <ShoppingCart size={22} />
                                    </div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-sub)' }}>
                                        Struk Masih Kosong
                                    </div>
                                    <div style={{ fontSize: '0.78rem' }}>
                                        Pilih obat di sisi kiri lalu klik <strong>&ldquo;Tambah ke Struk&rdquo;</strong>.
                                    </div>
                                </div>
                            ) : (
                                <table className={styles.receiptTable}>
                                    <thead>
                                        <tr>
                                            <th>No</th>
                                            <th>Nama & Kode Obat</th>
                                            <th>Batch / ED</th>
                                            <th style={{ textAlign: 'right' }}>Qty</th>
                                            <th style={{ textAlign: 'right' }}>Harga</th>
                                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                                            <th style={{ textAlign: 'center', width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cartItems.map((item, idx) => (
                                            <tr key={item.id}>
                                                <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.productName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}><code>{item.productCode}</code></div>
                                                </td>
                                                <td>
                                                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.batchId}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ED: {formatDate(item.edDate)}</div>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                                                    {item.qty} {item.uom}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{fmtRp(item.unitPrice)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                                    {fmtRp(item.totalPrice)}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFromCart(item.id)}
                                                        className={styles.btnTrashItem}
                                                        title="Hapus obat dari struk"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Receipt Checkout Box */}
                        <div className={styles.receiptCheckoutBox}>
                            <div>
                                <div className={styles.grandTotalRow}>
                                    <span className={styles.grandTotalLabel}>Grand Total Struk</span>
                                    <span className={styles.grandTotalAmount}>{fmtRp(cartGrandTotal)}</span>
                                </div>
                                <div className={styles.grandTotalSubtitle}>
                                    Total {cartTotalQty} item dari {cartItems.length} jenis obat Short ED
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleSubmitReceipt}
                                disabled={submitting || cartItems.length === 0 || !receiptNumber.trim()}
                                className={styles.btnSubmitReceipt}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                        Menyimpan Transaksi Struk...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} />
                                        Simpan Struk ({cartItems.length} Item) & Potong Stok
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── BAGIAN BAWAH: TABEL RIWAYAT PENJUALAN APOTEK ── */}
            <div className={styles.historySection}>
                <div className={styles.historyToolbar}>
                    <div>
                        <div className={styles.historyTitle}>Riwayat Penjualan Produk Short ED</div>
                        <div className={styles.historySubtitle}>
                            Daftar seluruh transaksi penjualan yang telah tercatat dan memotong stok
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
                            <Search size={13} style={{ position: 'absolute', left: '9px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
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
                            <Download size={14} />
                            Unduh Excel (.xlsx)
                        </button>
                    </div>
                </div>

                {/* Table Body */}
                <div className={styles.historyTableWrap}>
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
                        <table className={styles.historyTable}>
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
