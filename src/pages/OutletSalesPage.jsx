/**
 * OutletSalesPage.jsx — Form Pencatatan & Riwayat Penjualan Produk Short ED
 * Desain POS 2-Kolom: Master Products Lookup (Barcode Column as Item Code), No Batch, Edit & Delete Cart Items, Camera Barcode Scanner.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Receipt, Calendar, Hash, Package,
    CheckCircle2, AlertTriangle, Loader2, Download,
    RefreshCw, Search, X, TrendingUp, ShoppingBag,
    Plus, Trash2, ShoppingCart, Pencil, Check, Camera
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { searchProducts, searchProductByBarcode } from '../services/outletService';
import { recordBulkShortEdSales, fetchOutletSales, exportSalesToExcel } from '../services/salesService';
import BarcodeModal from '../components/BarcodeModal';
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

    // ── Scanner & Camera State ──
    const [cameraScanOpen, setCameraScanOpen] = useState(false);

    // ── Current Item Input State ──
    const [productQuery, setProductQuery] = useState('');
    const [barcodeQuery, setBarcodeQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null); // { barcode, product_code, item_description, uom }
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const [productSuggestions, setProductSuggestions] = useState([]);
    const [searchingProduct, setSearchingProduct] = useState(false);
    const [qty, setQty] = useState('');
    const [unitPrice, setUnitPrice] = useState('');

    // ── Cart & Edit State ──
    const [cartItems, setCartItems] = useState([]);
    const [editingItemId, setEditingItemId] = useState(null); // null or string id
    const [submitting, setSubmitting] = useState(false);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    // ── Toast Notification State ──
    const [toast, setToast] = useState(null); // { message, type }

    // ── Sales History State ──
    const [sales, setSales] = useState([]);
    const [loadingSales, setLoadingSales] = useState(true);

    // ── Table Filters State ──
    const [periodFilter, setPeriodFilter] = useState('CURRENT_MONTH');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [tableSearch, setTableSearch] = useState('');

    const searchWrapperRef = useRef(null);
    const barcodeInputRef = useRef(null);
    const qtyInputRef = useRef(null);

    // Auto-focus ke input barcode saat halaman pertama kali dimuat
    useEffect(() => {
        barcodeInputRef.current?.focus();
    }, []);

    // Kunci scroll body saat modal konfirmasi struk aktif
    useEffect(() => {
        if (confirmModalOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [confirmModalOpen]);

    // Keyboard ESC untuk menutup modal konfirmasi
    useEffect(() => {
        if (!confirmModalOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !submitting) {
                setConfirmModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmModalOpen, submitting]);

    // ── 1. Debounced Autocomplete Search dari master_products ──
    useEffect(() => {
        if (!productQuery || productQuery.trim().length < 2) {
            setProductSuggestions([]);
            setProductDropdownOpen(false);
            return;
        }

        let active = true;
        setSearchingProduct(true);
        setProductDropdownOpen(true);

        const timer = setTimeout(async () => {
            try {
                const results = await searchProducts(productQuery);
                if (active) {
                    setProductSuggestions(results || []);
                }
            } catch (err) {
                console.error('Error search master_products:', err);
                if (active) setProductSuggestions([]);
            } finally {
                if (active) setSearchingProduct(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [productQuery]);

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

    // ── 3. Handler Pilih Produk dari Dropdown Autocomplete ──
    const handleSelectProduct = (prod) => {
        setSelectedProduct(prod);
        setProductQuery('');
        // Selalu tampilkan nilai dari kolom barcode
        setBarcodeQuery(prod.barcode || prod.product_code || '');
        setProductDropdownOpen(false);
        setTimeout(() => {
            qtyInputRef.current?.focus();
        }, 50);
    };

    // ── 4. Handler Ketik / Scan Kode Produk ──
    const handleBarcodeChange = async (val) => {
        setBarcodeQuery(val);
        const clean = val.trim();
        if (!clean) {
            setSelectedProduct(null);
            return;
        }

        try {
            const matched = await searchProductByBarcode(clean);
            if (matched) {
                setSelectedProduct(matched);
                // Jika ditemukan via product_code / barcode, tampilkan data dari kolom barcode
                if (matched.barcode && matched.barcode !== clean) {
                    setBarcodeQuery(matched.barcode);
                }
                setTimeout(() => {
                    qtyInputRef.current?.focus();
                }, 80);
            }
        } catch (err) {
            console.error('Error product code lookup:', err);
        }
    };

    // ── Handler Scan via Kamera ──
    const handleCameraScanResult = async (scannedCode) => {
        setCameraScanOpen(false);
        if (!scannedCode || !scannedCode.trim()) return;

        const clean = scannedCode.trim();
        setToast({ message: 'Mencari produk...', type: 'info' });

        try {
            const matched = await searchProductByBarcode(clean);
            if (matched) {
                setSelectedProduct(matched);
                // Data yang dimunculkan harus tetap dari kolom barcode
                setBarcodeQuery(matched.barcode || matched.product_code || clean);
                setProductQuery('');
                setToast({ message: `Produk ditemukan: ${matched.item_description}`, type: 'success' });
                setTimeout(() => {
                    qtyInputRef.current?.focus();
                }, 80);
            } else {
                setBarcodeQuery(clean);
                setToast({ message: `Kode / Barcode "${clean}" tidak terdaftar di Master Produk.`, type: 'error' });
            }
        } catch (err) {
            setToast({ message: 'Gagal mencari produk: ' + err.message, type: 'error' });
        }
    };

    // ── Live Subtotal Preview ──
    const calculatedItemSubtotal = useMemo(() => {
        const q = parseFloat(qty) || 0;
        const p = parseFloat(unitPrice) || 0;
        return q * p;
    }, [qty, unitPrice]);

    // ── Validasi Tambah / Simpan Item ke Struk ──
    const isAddItemDisabled = useMemo(() => {
        if (!transactionDate) return true;
        if (!receiptNumber || !receiptNumber.trim()) return true;
        if (!selectedProduct) return true;
        const numQty = parseFloat(qty);
        if (isNaN(numQty) || numQty <= 0) return true;
        const numPrice = parseFloat(unitPrice);
        if (isNaN(numPrice) || numPrice <= 0) return true;
        return false;
    }, [transactionDate, receiptNumber, selectedProduct, qty, unitPrice]);

    // ── 5. Handler Tambah / Update Item ke Struk ──
    const handleAddOrUpdateItem = (e) => {
        e.preventDefault();

        if (isAddItemDisabled) {
            setToast({ message: 'Harap lengkapi Tanggal Transaksi, Nomor Struk, Produk, Qty (>0), dan Harga Satuan (>0).', type: 'error' });
            return;
        }

        const numericQty = parseFloat(qty);
        const numericPrice = parseFloat(unitPrice);
        const subtotal = Math.round(numericQty * numericPrice * 100) / 100;
        // Data yang ditaruh dan disimpan adalah dari kolom barcode Supabase
        const pCode = selectedProduct.barcode || selectedProduct.product_code || barcodeQuery.trim();
        const pName = selectedProduct.item_description || selectedProduct.description || pCode;
        const pUom = selectedProduct.uom || 'Pcs';

        if (editingItemId) {
            // Mode Update Item yang Sedang Diedit
            setCartItems(prev => prev.map(item => {
                if (item.id === editingItemId) {
                    return {
                        ...item,
                        productCode: pCode,
                        productName: pName,
                        uom: pUom,
                        qty: numericQty,
                        unitPrice: numericPrice,
                        totalPrice: subtotal
                    };
                }
                return item;
            }));

            setToast({ message: `✓ Perubahan ${pName} berhasil disimpan.`, type: 'success' });
            setEditingItemId(null);
        } else {
            // Mode Tambah Item Baru
            const newItem = {
                id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                productCode: pCode,
                productName: pName,
                uom: pUom,
                qty: numericQty,
                unitPrice: numericPrice,
                totalPrice: subtotal
            };

            setCartItems(prev => [...prev, newItem]);
            setToast({ message: `✓ ${pName} (${numericQty} ${pUom}) ditambahkan ke struk.`, type: 'success' });
        }

        // Reset input item
        setSelectedProduct(null);
        setBarcodeQuery('');
        setProductQuery('');
        setQty('');
        setUnitPrice('');

        // Auto-refocus ke input barcode agar kasir bisa langsung scan obat berikutnya
        setTimeout(() => {
            barcodeInputRef.current?.focus();
        }, 50);
    };

    // ── 6. Handler Edit Item dari Struk ──
    const handleEditItem = (item) => {
        setEditingItemId(item.id);
        setSelectedProduct({
            barcode: item.productCode,
            product_code: item.productCode,
            item_description: item.productName,
            uom: item.uom
        });
        setBarcodeQuery(item.productCode);
        setProductQuery('');
        setQty(String(item.qty));
        setUnitPrice(String(item.unitPrice));
    };

    // ── 7. Handler Batal Edit Item ──
    const handleCancelEdit = () => {
        setEditingItemId(null);
        setSelectedProduct(null);
        setBarcodeQuery('');
        setProductQuery('');
        setQty('');
        setUnitPrice('');
        setTimeout(() => {
            barcodeInputRef.current?.focus();
        }, 50);
    };

    // ── 8. Handler Hapus Item dari Struk ──
    const handleRemoveFromCart = (itemId) => {
        if (editingItemId === itemId) {
            handleCancelEdit();
        }
        setCartItems(prev => prev.filter(item => item.id !== itemId));
    };

    // ── 9. Grand Total Struk Aktif ──
    const { cartTotalQty, cartGrandTotal } = useMemo(() => {
        let totalQ = 0;
        let totalRp = 0;
        cartItems.forEach(item => {
            totalQ += item.qty;
            totalRp += item.totalPrice;
        });
        return { cartTotalQty: totalQ, cartGrandTotal: totalRp };
    }, [cartItems]);

    // ── 10. Handler Validasi & Buka Modal Konfirmasi Simpan Struk ──
    const handleOpenConfirmModal = () => {
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
        setConfirmModalOpen(true);
    };

    // ── Eksekusi Simpan Struk Setelah Dikonfirmasi ──
    const handleSubmitReceipt = async () => {
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

            // Tutup modal konfirmasi
            setConfirmModalOpen(false);

            // Reset keranjang & form
            setCartItems([]);
            setReceiptNumber('');
            handleCancelEdit();

            // Muat ulang riwayat
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
            const code = (s.master_products?.barcode || s.product_code || '').toLowerCase();
            const receipt = (s.receipt_number || '').toLowerCase();
            return name.includes(q) || code.includes(q) || receipt.includes(q);
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

            {/* Camera Barcode Scanner Modal */}
            <BarcodeModal
                isOpen={cameraScanOpen}
                onScan={handleCameraScanResult}
                onClose={() => setCameraScanOpen(false)}
            />

            {/* Modal Konfirmasi Simpan Transaksi Struk (Prioritas 2) */}
            {confirmModalOpen && createPortal(
                <div
                    className={styles.modalOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !submitting) {
                            setConfirmModalOpen(false);
                        }
                    }}
                >
                    <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
                        {/* Modal Header */}
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle} id="confirm-modal-title">
                                <ShoppingCart size={18} color="var(--primary)" />
                                Konfirmasi Simpan Struk Kasir
                            </div>
                            <button
                                type="button"
                                onClick={() => !submitting && setConfirmModalOpen(false)}
                                className={styles.modalCloseBtn}
                                disabled={submitting}
                                title="Tutup modal (Esc)"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className={styles.modalBody}>
                            {/* Ringkasan Header Struk */}
                            <div className={styles.modalSummaryCard}>
                                <div className={styles.modalSummaryRow}>
                                    <span className={styles.modalSummaryLabel}>Nomor Struk Kasir:</span>
                                    <span className={styles.modalSummaryValue}>
                                        <span className={styles.receiptBadge}>#{receiptNumber.trim()}</span>
                                    </span>
                                </div>
                                <div className={styles.modalSummaryRow}>
                                    <span className={styles.modalSummaryLabel}>Tanggal Transaksi:</span>
                                    <span className={styles.modalSummaryValue}>{formatDate(transactionDate)}</span>
                                </div>
                                <div className={styles.modalSummaryRow}>
                                    <span className={styles.modalSummaryLabel}>Apotek Pelapor:</span>
                                    <span className={styles.modalSummaryValue}>{user?.name || user?.code}</span>
                                </div>
                                <div className={styles.modalSummaryRow}>
                                    <span className={styles.modalSummaryLabel}>Total Fisik Terjual:</span>
                                    <span className={styles.modalSummaryValue} style={{ color: 'var(--primary)' }}>
                                        {cartTotalQty} item ({cartItems.length} jenis obat)
                                    </span>
                                </div>
                                <div className={`${styles.modalSummaryRow} ${styles.modalHighlightRow}`}>
                                    <span className={styles.modalSummaryLabel} style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                        Grand Total Nilai:
                                    </span>
                                    <span className={styles.modalHighlightAmount}>
                                        {fmtRp(cartGrandTotal)}
                                    </span>
                                </div>
                            </div>

                            {/* Daftar Rincian Obat */}
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-sub)' }}>
                                Rincian Obat dalam Struk ({cartItems.length} jenis):
                            </div>
                            <div className={styles.modalTableWrap}>
                                <table className={styles.modalTable}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '28px' }}>#</th>
                                            <th>Nama Obat</th>
                                            <th style={{ textAlign: 'right', width: '65px' }}>Qty</th>
                                            <th style={{ textAlign: 'right', width: '85px' }}>Harga</th>
                                            <th style={{ textAlign: 'right', width: '95px' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cartItems.map((item, i) => (
                                            <tr key={item.id}>
                                                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{item.productName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        <code>{item.productCode}</code>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {item.qty} {item.uom}
                                                </td>
                                                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                    {fmtRp(item.unitPrice)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                                    {fmtRp(item.totalPrice)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Warning Box */}
                            <div className={styles.modalAlertBox}>
                                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <strong>Perhatian:</strong> Transaksi yang disimpan akan langsung tercatat secara permanen di <strong>Rekap Penjualan Nasional</strong> dan mempengaruhi penilaian pencapaian Pillar Short ED. Pastikan tanggal transaksi dan nominal sudah sesuai struk fisik kasir.
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className={styles.modalFooter}>
                            <button
                                type="button"
                                onClick={() => setConfirmModalOpen(false)}
                                disabled={submitting}
                                className={styles.modalBtnCancel}
                            >
                                Periksa Kembali
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitReceipt}
                                disabled={submitting}
                                className={styles.modalBtnConfirm}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        Menyimpan Transaksi...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Ya, Simpan Transaksi ({fmtRp(cartGrandTotal)})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>Penjualan Produk Short ED</h2>
                    <p className={styles.pageSubtitle}>
                        Apotek: <strong>{user?.name || user?.code}</strong> · Pencatatan realisasi penjualan produk Short ED per struk kasir
                    </p>
                </div>

                <button
                    onClick={loadSalesData}
                    disabled={loadingSales}
                    className={styles.btnRefresh}
                >
                    <RefreshCw size={14} style={loadingSales ? { animation: 'spin 1s linear infinite' } : {}} />
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
                                2. {editingItemId ? 'Edit Item Obat' : 'Tambah Obat ke Struk'}
                            </div>
                            <span className={styles.badgePill}>
                                Master Database
                            </span>
                        </div>

                        <div className={styles.cardBody}>
                            {/* Edit Mode Banner */}
                            {editingItemId && (
                                <div className={styles.editModeBanner}>
                                    <div className={styles.editModeTitle}>
                                        <Pencil size={14} />
                                        Sedang Mengedit Item dalam Struk
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className={styles.btnCancelEdit}
                                    >
                                        Batal Edit
                                    </button>
                                </div>
                            )}

                            <form onSubmit={handleAddOrUpdateItem}>
                                <div className={styles.formGridFull}>
                                    {/* Scan / Ketik Kode Produk + Tombol Kamera */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Hash size={13} />
                                            Kode Produk (Scan / Ketik)
                                        </label>
                                        <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                                            <input
                                                ref={barcodeInputRef}
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="Scan barcode atau ketik kode produk..."
                                                value={barcodeQuery}
                                                onChange={e => handleBarcodeChange(e.target.value)}
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setCameraScanOpen(true)}
                                                title="Scan dengan Kamera Ponsel"
                                                style={{
                                                    minWidth: '42px', height: '42px',
                                                    background: 'var(--primary)', color: 'white',
                                                    border: 'none', borderRadius: 'var(--radius-sm)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', flexShrink: 0,
                                                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.25)',
                                                    transition: 'all var(--duration)',
                                                }}
                                            >
                                                <Camera size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Lookup Nama Obat dari master_products */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Search size={13} />
                                            Pencarian Nama Obat (Master Products)
                                        </label>
                                        <div className={styles.searchWrapper} ref={searchWrapperRef}>
                                            <Search size={14} className={styles.searchIconLeft} />
                                            <input
                                                type="text"
                                                className={styles.searchInput}
                                                placeholder="Ketik minimal 2 huruf nama obat..."
                                                value={productQuery}
                                                onChange={e => {
                                                    setProductQuery(e.target.value);
                                                    setProductDropdownOpen(true);
                                                }}
                                                onFocus={() => productQuery.length >= 2 && setProductDropdownOpen(true)}
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
                                            {productDropdownOpen && (
                                                <div className={styles.dropdownMenu}>
                                                    {searchingProduct ? (
                                                        <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            Mencari di master products...
                                                        </div>
                                                    ) : productSuggestions.length === 0 ? (
                                                        <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            Produk tidak ditemukan
                                                        </div>
                                                    ) : (
                                                        productSuggestions.map(p => (
                                                            <div
                                                                key={p.barcode || p.product_code}
                                                                onClick={() => handleSelectProduct(p)}
                                                                className={styles.dropdownItem}
                                                            >
                                                                <div className={styles.dropdownItemName}>{p.item_description}</div>
                                                                <div className={styles.dropdownItemMeta}>
                                                                    <span>Kode: <code>{p.barcode || p.product_code}</code></span>
                                                                    <span>· Satuan: {p.uom || 'Pcs'}</span>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Banner Produk Terpilih */}
                                {selectedProduct && (
                                    <div className={styles.selectedProductBanner}>
                                        <div className={styles.selectedProductInfo}>
                                            <div className={styles.selectedProductName}>
                                                {selectedProduct.item_description || selectedProduct.description}
                                            </div>
                                            <div className={styles.selectedProductDetails}>
                                                <span>Kode Produk: <code>{selectedProduct.barcode || selectedProduct.product_code}</code></span>
                                                <span>·</span>
                                                <span>Satuan: <strong>{selectedProduct.uom || 'Pcs'}</strong></span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedProduct(null); setBarcodeQuery(''); setTimeout(() => barcodeInputRef.current?.focus(), 50); }}
                                            className={styles.btnChangeProduct}
                                        >
                                            Ganti
                                        </button>
                                    </div>
                                )}

                                {/* Qty & Harga Satuan (Manual Input) */}
                                <div className={styles.formGrid} style={{ marginTop: '14px' }}>
                                    {/* Qty Terjual */}
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            Jumlah (Qty) <span className={styles.requiredStar}>*</span>
                                        </label>
                                        <input
                                            ref={qtyInputRef}
                                            type="number"
                                            className={styles.formInput}
                                            placeholder="0"
                                            min="0.01"
                                            step="any"
                                            value={qty}
                                            onChange={e => setQty(e.target.value)}
                                            required
                                        />
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
                                                placeholder="Contoh: 15000"
                                                min="0.01"
                                                step="any"
                                                value={unitPrice}
                                                onChange={e => setUnitPrice(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Live Item Subtotal Preview Bar */}
                                {qty && unitPrice && parseFloat(qty) > 0 && parseFloat(unitPrice) > 0 ? (
                                    <div className={styles.itemSubtotalBanner}>
                                        <span className={styles.itemSubtotalLabel}>Subtotal Item:</span>
                                        <span className={styles.itemSubtotalValue}>{fmtRp(calculatedItemSubtotal)}</span>
                                    </div>
                                ) : null}

                                {/* Action Buttons */}
                                {editingItemId ? (
                                    <div className={styles.actionBtnGroup}>
                                        <button
                                            type="submit"
                                            disabled={isAddItemDisabled}
                                            className={styles.btnSaveEdit}
                                        >
                                            <Check size={16} />
                                            Simpan Perubahan Item
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className={styles.btnCancelEdit}
                                            style={{ height: '44px', padding: '0 16px' }}
                                        >
                                            Batal
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={isAddItemDisabled}
                                        className={styles.btnAddItem}
                                    >
                                        <Plus size={16} />
                                        Tambah ke Struk
                                    </button>
                                )}
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
                                        Isi tanggal & no. struk, lalu masukkan obat dan klik <strong>&ldquo;Tambah ke Struk&rdquo;</strong>.
                                    </div>
                                </div>
                            ) : (
                                <table className={styles.receiptTable}>
                                    <thead>
                                        <tr>
                                            <th>No</th>
                                            <th>Nama & Kode Obat</th>
                                            <th style={{ textAlign: 'right' }}>Qty</th>
                                            <th style={{ textAlign: 'right' }}>Harga Satuan</th>
                                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                                            <th style={{ textAlign: 'center', width: '70px' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cartItems.map((item, idx) => (
                                            <tr
                                                key={item.id}
                                                className={editingItemId === item.id ? styles.receiptRowEditing : ''}
                                            >
                                                <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.productName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}><code>{item.productCode}</code></div>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                                                    {item.qty} {item.uom}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{fmtRp(item.unitPrice)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                                    {fmtRp(item.totalPrice)}
                                                </td>
                                                <td>
                                                    <div className={styles.actionCell}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditItem(item)}
                                                            className={styles.btnEditItem}
                                                            title="Edit item ini"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFromCart(item.id)}
                                                            className={styles.btnTrashItem}
                                                            title="Hapus obat dari struk"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
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
                                onClick={handleOpenConfirmModal}
                                disabled={submitting || cartItems.length === 0 || !receiptNumber.trim() || !transactionDate}
                                className={styles.btnSubmitReceipt}
                            >
                                <CheckCircle2 size={18} />
                                Simpan Struk ({cartItems.length} Item)
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
                            Daftar seluruh transaksi penjualan yang telah tercatat
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
                                placeholder="Cari nama, struk, kode..."
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
                                        <td><code className={styles.codeBadge}>{s.master_products?.barcode || s.product_code}</code></td>
                                        <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                            {s.master_products?.item_description || '(Tidak diketahui)'}
                                        </td>
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
                                    <td colSpan={4} style={{ textAlign: 'right' }}>
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
