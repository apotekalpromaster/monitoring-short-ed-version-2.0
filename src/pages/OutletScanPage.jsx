/**
 * OutletScanPage.jsx — Halaman Scan Barcode Produk
 *
 * Flow:
 *   1. User scan via kamera (tombol kamera) ATAU scan fisik (ketik + Enter)
 *   2. Query ke master_products berdasarkan barcode
 *   3. Jika ditemukan → tampilkan mini-form (Batch, ED, Qty, Remark) di bawah
 *   4. Jika tidak ditemukan → Toast error
 *   5. Submit → insert ke stocks_ed → reset halaman
 */

import { useState, useRef } from 'react';
import {
    ScanLine, Camera, X, Hash, Calendar, Weight,
    AlignLeft, CheckCircle2, Loader2, AlertTriangle, RefreshCw
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { searchProductByBarcode, isProductExcluded, saveStockEntry } from '../services/outletService';
import BarcodeModal from '../components/BarcodeModal';
import styles from './OutletInputPage.module.css';   // Berbagi CSS dengan OutletInputPage

// ─────────────────────────────────────────────────────────────────────────────
// Toast Component (sama dengan OutletInputPage)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';

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
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'inherit' }}><X size={14} /></button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { batchId: '', edDate: '', qty: '', remark: '' };

export default function OutletScanPage() {
    const user = useAuthStore(s => s.user);

    // ── Scanner state ──
    const [cameraScanOpen, setCameraScanOpen] = useState(false);
    const [scanningBarcode, setScanningBarcode] = useState(false);

    // Physical scanner buffer
    const physicalBuffer = useRef('');
    const lastKeyTime = useRef(0);
    const scanInputRef = useRef(null);
    const batchRef = useRef(null);

    // ── Product & form state ──
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);

    // ── Toast ──
    const [toast, setToast] = useState(null);
    function showToast(msg, type = 'info') { setToast({ message: msg, type }); }

    // ── Handle barcode result (from camera OR physical scanner) ──
    async function handleBarcodeScanned(barcode) {
        setCameraScanOpen(false);
        setScanningBarcode(true);
        showToast('Mencari produk...', 'info');

        try {
            const product = await searchProductByBarcode(barcode);
            if (product) {
                setSelectedProduct(product);
                setForm(EMPTY_FORM);
                showToast(`Produk ditemukan: ${product.item_description}`, 'success');
                // Auto-focus ke Nomor Batch
                setTimeout(() => batchRef.current?.focus(), 100);
            } else {
                showToast(`Barcode "${barcode}" tidak terdaftar di Master Produk.`, 'error');
            }
        } catch (err) {
            showToast('Gagal mencari barcode: ' + err.message, 'error');
        } finally {
            setScanningBarcode(false);
        }
    }

    // ── Physical scanner detection ──
    function handlePhysicalScanKeyDown(e) {
        const now = Date.now();
        const diff = now - lastKeyTime.current;
        lastKeyTime.current = now;

        if (e.key === 'Enter') {
            e.preventDefault();
            const buf = physicalBuffer.current;
            physicalBuffer.current = '';
            if (buf.length >= 4) {
                handleBarcodeScanned(buf);
            }
        } else if (e.key.length === 1) {
            if (diff > 100) physicalBuffer.current = '';
            physicalBuffer.current += e.key;
        }
    }

    // ── Form ──
    function handleFormChange(e) {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    }

    function resetScan() {
        setSelectedProduct(null);
        setForm(EMPTY_FORM);
        // Re-focus scanner input
        setTimeout(() => scanInputRef.current?.focus(), 80);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!selectedProduct) return;
        if (!form.batchId.trim()) { showToast('Nomor Batch wajib diisi.', 'error'); return; }
        if (!form.edDate) { showToast('Tanggal ED wajib diisi.', 'error'); return; }
        if (!form.qty || parseFloat(form.qty) <= 0) { showToast('Qty harus > 0.', 'error'); return; }

        setSubmitting(true);
        showToast('Menyimpan...', 'info');

        try {
            const excluded = await isProductExcluded(selectedProduct.product_code);
            if (excluded) {
                showToast(`${selectedProduct.item_description} masuk Daftar Pengecualian (Non-ED).`, 'error');
                setSubmitting(false);
                return;
            }

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
            resetScan();
        } catch (err) {
            showToast('Gagal menyimpan: ' + err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fade-up">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            {/* Page Header */}
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Scan Barcode</h2>
                <p className={styles.pageSubtitle}>
                    Apotek: <strong>{user?.name}</strong> — scan menggunakan kamera atau scanner USB
                </p>
            </div>

            {/* ── Scanner Area ── */}
            <div className={styles.formCard} style={{ marginBottom: '18px' }}>
                <div className={styles.formCardHeader}>
                    <ScanLine size={16} />
                    Area Scan Produk
                </div>
                <div className={styles.formCardBody}>

                    {!selectedProduct ? (
                        <>
                            {/* Physical scanner input (hidden but focused captures keystrokes) */}
                            <div style={{ marginBottom: '14px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
                                Fokuskan kursor di sini, lalu scan barcode menggunakan scanner USB —
                                atau tekan tombol kamera untuk scan via kamera ponsel.
                            </div>

                            {/* Input field menerima keystroke scanner fisik */}
                            <div style={{ position: 'relative', display: 'flex', gap: '10px' }}>
                                <input
                                    ref={scanInputRef}
                                    autoFocus
                                    type="text"
                                    placeholder="Barcode otomatis terisi oleh scanner fisik (Enter untuk proses)..."
                                    className={styles.searchInput}
                                    style={{ flex: 1, paddingLeft: '14px', cursor: 'text' }}
                                    onKeyDown={handlePhysicalScanKeyDown}
                                    readOnly={scanningBarcode}
                                />
                                {/* Camera button */}
                                <button
                                    type="button"
                                    onClick={() => setCameraScanOpen(true)}
                                    disabled={scanningBarcode}
                                    style={{
                                        minWidth: '46px', height: '46px',
                                        background: 'var(--primary)', color: 'white',
                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                        boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                                        transition: 'opacity 0.15s',
                                        opacity: scanningBarcode ? 0.6 : 1,
                                    }}
                                    title="Scan dengan Kamera"
                                >
                                    {scanningBarcode
                                        ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                        : <Camera size={18} />}
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Produk ditemukan — tampilkan badge + tombol reset */
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div className={styles.selectedProduct} style={{ flex: 1, margin: 0 }}>
                                <div>
                                    <div className={styles.selectedProductName}>{selectedProduct.item_description}</div>
                                    <div className={styles.selectedProductCode}>
                                        {selectedProduct.barcode || selectedProduct.product_code} · {selectedProduct.uom}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={resetScan}
                                title="Scan ulang"
                                style={{
                                    background: 'none', border: '1.5px solid var(--border)', borderRadius: '8px',
                                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    gap: '6px', fontSize: '0.8rem', color: 'var(--text-sub)', fontFamily: 'inherit',
                                    transition: 'border-color 0.15s',
                                }}
                            >
                                <RefreshCw size={14} /> Scan Ulang
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Mini Form (muncul setelah produk ditemukan) ── */}
            {selectedProduct && (
                <div className={styles.formCard}>
                    <div className={styles.formCardHeader}>
                        <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                        Lengkapi Data Stok
                    </div>
                    <div className={styles.formCardBody}>
                        <form onSubmit={handleSubmit} autoComplete="off">
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}><Hash size={11} /> Nomor Batch</label>
                                    <input
                                        ref={batchRef}
                                        type="text"
                                        name="batchId"
                                        value={form.batchId}
                                        onChange={handleFormChange}
                                        placeholder="Contoh: BN240901"
                                        className={styles.formInput}
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}><Calendar size={11} /> Tanggal ED</label>
                                    <input
                                        type="date"
                                        name="edDate"
                                        value={form.edDate}
                                        onChange={handleFormChange}
                                        className={styles.formInput}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}><Weight size={11} /> Qty Fisik</label>
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
                                    <label className={styles.formLabel}><AlignLeft size={11} /> Keterangan (Opsional)</label>
                                    <textarea
                                        name="remark"
                                        value={form.remark}
                                        onChange={handleFormChange}
                                        placeholder="Catatan tambahan..."
                                        className={styles.formTextarea}
                                        rows={2}
                                    />
                                </div>
                            </div>

                            <button type="submit" className={styles.submitBtn} disabled={submitting}>
                                {submitting
                                    ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Menyimpan...</>
                                    : <><CheckCircle2 size={16} /> SIMPAN DATA</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Camera Modal */}
            <BarcodeModal
                isOpen={cameraScanOpen}
                onScan={handleBarcodeScanned}
                onClose={() => setCameraScanOpen(false)}
            />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
