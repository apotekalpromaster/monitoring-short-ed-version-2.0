/**
 * DashboardOutlet.jsx
 * Role OUTLET — halaman landing setelah login.
 * Karena fungsi utama outlet ada di OutletInputPage (Input Data),
 * halaman ini menjadi ringkasan cepat navigasi ke 3 sub-page.
 */
import { useNavigate } from 'react-router-dom';
import { ScanLine, ClipboardPen, Activity, ArrowRight } from 'lucide-react';
import useAuthStore from '../store/authStore';
import styles from './Dashboard.module.css';

const CARDS = [
    {
        to: '/outlet/scan',
        icon: ScanLine,
        title: 'Scan Barcode',
        desc: 'Pindai barcode produk menggunakan kamera ponsel atau scanner USB.',
        color: '--primary',
    },
    {
        to: '/outlet/input',
        icon: ClipboardPen,
        title: 'Input Data Manual',
        desc: 'Cari produk dari katalog, isi Batch, Tanggal ED, Qty, dan Remark.',
        color: '--success',
    },
    {
        to: '/outlet/monitoring',
        icon: Activity,
        title: 'Monitoring Produk ED',
        desc: 'Pantau seluruh stok mendekati kadaluarsa berdasarkan kategori waktu.',
        color: '--warning',
    },
];

export default function DashboardOutlet() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();

    return (
        <div className="fade-up">
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Selamat Datang</h2>
                <p className={styles.pageSubtitle}>
                    <strong>{user?.name}</strong> — pilih menu di bawah untuk memulai.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                {CARDS.map(({ to, icon: Icon, title, desc, color }) => (
                    <button
                        key={to}
                        onClick={() => navigate(to)}
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '22px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            boxShadow: 'var(--shadow-xs)',
                            transition: 'box-shadow 0.2s, transform 0.2s',
                            fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; e.currentTarget.style.transform = 'none'; }}
                    >
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: `var(${color}-light, #eff6ff)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: `var(${color}, var(--primary))`,
                        }}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.975rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                {title}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: `var(${color}, var(--primary))`, marginTop: 'auto' }}>
                            Buka <ArrowRight size={14} />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
