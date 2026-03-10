/**
 * BarcodeModal.jsx — Camera Barcode Scanner Modal
 *
 * Menggunakan html5-qrcode untuk akses kamera.
 * Lifecycle:
 *   - Saat modal muncul → kamera dimulai
 *   - Saat barcode terbaca → callback onScan(barcodeValue) dipanggil, kamera dimatikan
 *   - Saat ditutup (X) → kamera dimatikan, modal hilang
 *
 * Props:
 *   - isOpen    : boolean — apakah modal ditampilkan
 *   - onScan    : (barcode: string) => void — dipanggil saat scan berhasil
 *   - onClose   : () => void — dipanggil saat modal ditutup
 */

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Loader2 } from 'lucide-react';
import styles from './BarcodeModal.module.css';

// ID elemen DOM tempat html5-qrcode menaruh kamera
const SCANNER_ELEMENT_ID = 'html5qr-scanner-region';

/** Fungsi Web Audio API untuk "beep" sinyal sukses scan */
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
    } catch (_) {
        // Tidak semua browser mendukung AudioContext
    }
}

export default function BarcodeModal({ isOpen, onScan, onClose }) {
    const scannerRef = useRef(null); // instance Html5Qrcode
    const [status, setStatus] = useState('idle'); // 'idle' | 'starting' | 'ready' | 'success' | 'error'
    const [errorMsg, setErrorMsg] = useState('');

    // ── Start kamera saat modal dibuka ──
    useEffect(() => {
        if (!isOpen) return;

        let scanner;
        let cancelled = false;

        async function startScanner() {
            setStatus('starting');
            setErrorMsg('');

            try {
                // Tunggu DOM element tersedia
                await new Promise(resolve => setTimeout(resolve, 100));
                if (cancelled) return;

                scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
                scannerRef.current = scanner;

                const devices = await Html5Qrcode.getCameras();
                if (!devices || devices.length === 0) throw new Error('Tidak ada kamera yang ditemukan.');

                // Prioritaskan kamera belakang (environment)
                const rearCam = devices.find(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                ) || devices[devices.length - 1];

                if (cancelled) return;

                await scanner.start(
                    rearCam.id,
                    { fps: 12, qrbox: { width: 200, height: 120 } },
                    (decodedText) => {
                        // Barcode berhasil dibaca!
                        playBeep();
                        if (navigator.vibrate) navigator.vibrate(80);
                        setStatus('success');
                        stopScanner(scanner).then(() => {
                            onScan(decodedText);
                        });
                    },
                    () => { /* silent: scan belum berhasil */ }
                );

                if (!cancelled) setStatus('ready');
            } catch (err) {
                if (!cancelled) {
                    setStatus('error');
                    setErrorMsg(err.message || 'Gagal mengakses kamera.');
                }
            }
        }

        startScanner();

        return () => {
            cancelled = true;
            if (scannerRef.current) {
                stopScanner(scannerRef.current);
                scannerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    async function stopScanner(instance) {
        try {
            if (instance?.isScanning) await instance.stop();
            instance?.clear();
        } catch (_) { /* abaikan error saat stop */ }
    }

    function handleClose() {
        if (scannerRef.current) {
            stopScanner(scannerRef.current);
            scannerRef.current = null;
        }
        setStatus('idle');
        setErrorMsg('');
        onClose();
    }

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className={styles.modal}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <span className={styles.modalTitle}>
                        <Camera size={16} />
                        Scan Barcode Produk
                    </span>
                    <button className={styles.closeBtn} onClick={handleClose} title="Tutup">
                        <X size={18} />
                    </button>
                </div>

                {/* Viewfinder */}
                <div className={styles.viewfinderWrap}>
                    <div id={SCANNER_ELEMENT_ID} />
                    {/* Aiming overlay — hanya tampil saat kamera aktif */}
                    {status === 'ready' && (
                        <div className={styles.aimOverlay}>
                            <div className={styles.aimBox}>
                                <div className={styles.scanLine} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <div className={styles.statusBar}>
                    {status === 'starting' && (
                        <>
                            <Loader2 size={14} className={styles.spin} />
                            <span>Mengaktifkan kamera...</span>
                        </>
                    )}
                    {status === 'ready' && (
                        <span className={styles.statusReady}>
                            Arahkan kamera ke barcode produk
                        </span>
                    )}
                    {status === 'success' && (
                        <span className={styles.statusSuccess}>
                            ✓ Barcode terbaca! Mencari produk...
                        </span>
                    )}
                    {status === 'error' && (
                        <span className={styles.statusError}>
                            ⚠ {errorMsg}
                        </span>
                    )}
                    {status === 'idle' && (
                        <span>Mempersiapkan scanner...</span>
                    )}
                </div>
            </div>
        </div>
    );
}
