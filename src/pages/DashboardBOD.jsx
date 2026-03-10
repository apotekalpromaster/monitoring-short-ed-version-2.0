import { Package, TrendingDown, AlertTriangle, BarChart3, TableProperties } from 'lucide-react';
import useAuthStore from '../store/authStore';
import styles from './Dashboard.module.css';

export default function DashboardBOD() {
    const user = useAuthStore((s) => s.user);

    return (
        <div className="fade-up">
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Dashboard BOD</h2>
                <p className={styles.pageSubtitle}>
                    Ringkasan Risiko Produk ED — selamat datang, <strong>{user?.name}</strong>.
                </p>
            </div>

            {/* KPI — sesuai kode lama (bod-page): Total Nilai Stok Berisiko, Jumlah SKU, Total Nilai ED Terkumpul */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Nilai Stok Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.red}`}><AlertTriangle size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>—</div>
                    <div className={styles.kpiMeta}>Semua kategori ED</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Jumlah SKU Berisiko</span>
                        <div className={`${styles.kpiIconWrap} ${styles.amber}`}><Package size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>—</div>
                    <div className={styles.kpiMeta}>Lintas semua outlet</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <span className={styles.kpiLabel}>Total Nilai ED Terkumpul</span>
                        <div className={`${styles.kpiIconWrap} ${styles.green}`}><TrendingDown size={16} /></div>
                    </div>
                    <div className={styles.kpiValue}>—</div>
                    <div className={styles.kpiMeta}>Produk kedaluwarsa terkumpul</div>
                </div>
            </div>

            {/* Charts placeholder — sesuai bod-page: Tren Penanganan, Tren Nilai, Top 10 Apotek, Top 10 AM, Distribusi Aksi */}
            <div className={styles.twoCol} style={{ marginBottom: '16px' }}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Tren Penanganan Stok ED (Bulanan)</span>
                    </div>
                    <div className={styles.placeholder}>
                        <div className={styles.placeholderIcon}><BarChart3 size={22} /></div>
                        <p className={styles.placeholderText}>Area Grafik</p>
                        <p className={styles.placeholderSub}>Tersedia di Fase 4</p>
                    </div>
                </div>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Tren Nilai Stok Berisiko per Kategori</span>
                    </div>
                    <div className={styles.placeholder}>
                        <div className={styles.placeholderIcon}><BarChart3 size={22} /></div>
                        <p className={styles.placeholderText}>Area Grafik</p>
                        <p className={styles.placeholderSub}>Tersedia di Fase 4</p>
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Top 10 Apotek Berisiko & Top 10 AM Berisiko</span>
                </div>
                <div className={styles.placeholder}>
                    <div className={styles.placeholderIcon}><TableProperties size={22} /></div>
                    <p className={styles.placeholderText}>Area Tabel Ranking</p>
                    <p className={styles.placeholderSub}>Tersedia di Fase 4</p>
                </div>
            </div>
        </div>
    );
}
