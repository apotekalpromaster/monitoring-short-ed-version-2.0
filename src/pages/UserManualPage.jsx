/**
 * UserManualPage.jsx — Halaman Panduan Pengguna (User Manual)
 * Tersedia untuk seluruh role (Outlet, AM, Procurement, BOD).
 * Dilengkapi Navigasi Tab, Panduan Lengkap, FAQ Interaktif, dan Unduh Dokumen Word.
 */

import { useState, useMemo } from 'react';
import {
    BookOpen, Search, X, Download, HelpCircle,
    ScanLine, ClipboardPen, Activity, Receipt,
    LayoutDashboard, PackageSearch, CheckCircle2,
    AlertCircle, ChevronDown, ChevronRight, Smartphone,
    FileText, Layers, ShieldCheck
} from 'lucide-react';
import styles from './UserManualPage.module.css';

// ── FAQ Dataset ──
const FAQ_DATA = [
    {
        id: 'faq-1',
        category: 'outlet',
        question: 'Mengapa saya tidak bisa menginput obat dengan tanggal ED setelah 30 September 2027?',
        answer: 'Sesuai kebijakan batas operasional sistem saat ini, pencatatan difokuskan pada produk yang kedaluwarsa maksimal hingga 30 September 2027. Obat dengan masa kedaluwarsa di atas tanggal tersebut belum dikategorikan sebagai Short ED dan tidak perlu diinput saat ini.'
    },
    {
        id: 'faq-2',
        category: 'outlet',
        question: 'Kenapa tombol "+ Tambah ke Struk" di menu Penjualan warnanya pudar dan tidak bisa diklik?',
        answer: 'Tombol dinonaktifkan secara otomatis sebagai pengaman agar tidak terjadi salah input. Pastikan 5 hal berikut sudah terisi: (1) Tanggal Transaksi, (2) Nomor Struk Kasir, (3) Obat sudah dipilih dari database, (4) Jumlah (Qty) > 0, dan (5) Harga Satuan > Rp 0.'
    },
    {
        id: 'faq-3',
        category: 'outlet',
        question: 'Kamera tidak mau menyala saat tombol Kamera diklik di HP, apa solusinya?',
        answer: 'Pastikan Anda telah memberikan izin (Allow / Izinkan) akses kamera pada peramban web (Google Chrome / Safari) di HP Anda. Jika sebelumnya tidak sengaja tertekan Block/Tolak, buka Pengaturan Browser > Pengaturan Situs > Kamera > Ubah menjadi Izinkan untuk web ini.'
    },
    {
        id: 'faq-4',
        category: 'outlet',
        question: 'Scanner barcode USB di laptop kasir tidak memunculkan nama obat secara otomatis?',
        answer: 'Pastikan kursor komputer sedang aktif berada di dalam kotak input "Kode Produk (Scan / Ketik)". Setelah menembak barcode dengan scanner, jika nama obat belum muncul, tekan tombol Enter pada keyboard komputer Anda.'
    },
    {
        id: 'faq-5',
        category: 'outlet',
        question: 'Saya salah menginput harga atau jumlah pada item di struk kasir, apakah bisa diubah?',
        answer: 'BISA. Sebelum Anda mengklik tombol "Simpan Struk", lihat keranjang Struk Aktif di sebelah kanan. Klik tombol bergambar Pensil (✏️) untuk mengedit angkanya, atau klik tombol Tempat Sampah (🗑) untuk menghapus item tersebut dari struk.'
    },
    {
        id: 'faq-6',
        category: 'outlet',
        question: 'Apakah penjualan yang disimpan di menu Penjualan Short ED otomatis memotong stok di Monitoring Produk ED?',
        answer: 'TIDAK. Menu Penjualan dan Monitoring Stok adalah dua program pencatatan terpisah di dalam aplikasi ini. Penjualan bertujuan mencatat realisasi omzet struk kasir, sedangkan Monitoring Stok mencatat ketersediaan fisik obat di rak apotek.'
    },
    {
        id: 'faq-7',
        category: 'all',
        question: 'Bagaimana cara membuka layar penuh jika tabel terlalu lebar di laptop?',
        answer: 'Klik tombol Hamburger (ikon 3 garis) di pojok kiri atas aplikasi. Menu samping akan otomatis tertutup dan seluruh layar akan menjadi area kerja tabel (100% full-width). Untuk memunculkan menu samping kembali, cukup klik tombol itu sekali lagi.'
    },
    {
        id: 'faq-8',
        category: 'all',
        question: 'Bagaimana jika nama obat yang dicari tidak ditemukan di Master Database?',
        answer: 'Periksa kembali ejaan nama obat atau coba cari menggunakan nomor barcode kemasan. Jika tetap tidak ditemukan, kemungkinan produk tersebut belum didaftarkan di Master Produk pusat. Harap laporkan kode dan nama produk ke tim IT / Procurement pusat.'
    }
];

export default function UserManualPage() {
    const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'OUTLET' | 'AM' | 'PROCUREMENT' | 'BOD' | 'FAQ'
    const [searchQuery, setSearchQuery] = useState('');
    const [openFaq, setOpenFaq] = useState({ 'faq-1': true, 'faq-2': true });

    const toggleFaq = (id) => {
        setOpenFaq(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Filter FAQ berdasarkan pencarian & tab
    const filteredFaqs = useMemo(() => {
        let list = FAQ_DATA;
        if (activeTab !== 'ALL' && activeTab !== 'FAQ') {
            const catMap = { OUTLET: 'outlet', AM: 'all', PROCUREMENT: 'all', BOD: 'all' };
            list = list.filter(f => f.category === catMap[activeTab] || f.category === 'all');
        }
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase().trim();
        return list.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
    }, [activeTab, searchQuery]);

    return (
        <div className="fade-up">
            {/* ── Page Header ── */}
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.pageTitle}>
                        <BookOpen size={24} color="var(--primary)" />
                        Panduan Pengguna (User Manual)
                    </h2>
                    <p className={styles.pageSubtitle}>
                        Petunjuk operasional lengkap, panduan alur kerja per role, dan solusi kendala sistem Monitoring Short ED v2.0
                    </p>
                </div>

                <div className={styles.headerActions}>
                    <a
                        href="/User_Manual_Monitoring_Short_ED_v2_UAT.docx"
                        download="User_Manual_Monitoring_Short_ED_v2_UAT.docx"
                        className={styles.btnDownloadDocx}
                        title="Unduh Panduan Lengkap Versi Microsoft Word"
                    >
                        <Download size={15} />
                        Unduh Dokumen Word (.docx)
                    </a>
                </div>
            </div>

            {/* ── Search & Tab Filters ── */}
            <div className={styles.searchFilterBar}>
                {/* Search Bar */}
                <div className={styles.searchWrap}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Cari topik panduan, fitur, atau pertanyaan..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className={styles.clearSearchBtn}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className={styles.tabsList}>
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`${styles.tabBtn} ${activeTab === 'ALL' ? styles.tabBtnActive : ''}`}
                    >
                        🌟 Semua Topik
                    </button>
                    <button
                        onClick={() => setActiveTab('OUTLET')}
                        className={`${styles.tabBtn} ${activeTab === 'OUTLET' ? styles.tabBtnActive : ''}`}
                    >
                        🏪 Outlet / Cabang
                    </button>
                    <button
                        onClick={() => setActiveTab('AM')}
                        className={`${styles.tabBtn} ${activeTab === 'AM' ? styles.tabBtnActive : ''}`}
                    >
                        👔 Area Manager
                    </button>
                    <button
                        onClick={() => setActiveTab('PROCUREMENT')}
                        className={`${styles.tabBtn} ${activeTab === 'PROCUREMENT' ? styles.tabBtnActive : ''}`}
                    >
                        📦 Procurement
                    </button>
                    <button
                        onClick={() => setActiveTab('BOD')}
                        className={`${styles.tabBtn} ${activeTab === 'BOD' ? styles.tabBtnActive : ''}`}
                    >
                        💼 BOD / Eksekutif
                    </button>
                    <button
                        onClick={() => setActiveTab('FAQ')}
                        className={`${styles.tabBtn} ${activeTab === 'FAQ' ? styles.tabBtnActive : ''}`}
                    >
                        ❓ Tanya Jawab & Solusi
                    </button>
                </div>
            </div>

            {/* ── Main Content Grid ── */}
            <div className={styles.contentGrid}>
                {/* ── SEKSI 1: NAVIGASI BARU & TAMPILAN (ALL) ── */}
                {(activeTab === 'ALL') && !searchQuery && (
                    <div className={styles.guideCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <Layers size={18} color="var(--primary)" />
                                1. Navigasi & Tampilan Antarmuka Baru
                            </div>
                            <span className={`${styles.cardBadge} ${styles.cardBadgePrimary}`}>Semua Role</span>
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.cardDescription}>
                                Sistem Monitoring Short ED v2.0 telah diperbarui dengan tata letak yang bersih, responsif, dan mudah digunakan di komputer kasir maupun ponsel:
                            </div>

                            <div className={styles.featureList}>
                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <CheckCircle2 size={14} color="var(--primary)" />
                                        Side Panel Statis (Fixed)
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Menu samping tetap berada di tempatnya saat Anda men-scroll halaman web ke bawah. Tidak akan pernah terpotong atau tergulung.
                                    </div>
                                </div>

                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <CheckCircle2 size={14} color="var(--primary)" />
                                        Tombol Buka / Tutup Menu (Hamburger)
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Klik tombol hamburger di pojok kiri atas untuk melipat menu samping dan memaksimalkan lebar layar tabel (100% full width).
                                    </div>
                                </div>

                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <Smartphone size={14} color="var(--primary)" />
                                        Optimalisasi Mobile
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Navigasi dan formulir dirancang nyaman digunakan melalui smartphone dengan kontrol sentuh yang presisi.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── SEKSI 2: PANDUAN ROLE OUTLET ── */}
                {(activeTab === 'ALL' || activeTab === 'OUTLET') && (
                    <>
                        {/* Menu Penjualan Short ED */}
                        <div className={styles.guideCard}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardTitle}>
                                    <Receipt size={18} color="var(--primary)" />
                                    Penjualan Produk Short ED (Kasir POS Terpadu)
                                </div>
                                <span className={`${styles.cardBadge} ${styles.cardBadgePrimary}`}>Role Outlet</span>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.cardDescription}>
                                    Mencatat transaksi penjualan produk Short ED per nomor struk kasir. Staf dapat memasukkan beberapa obat sekaligus ke dalam 1 nomor transaksi struk.
                                </div>

                                <div className={styles.stepsList}>
                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>1</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Isi Data Struk Kasir</div>
                                            <div className={styles.stepDesc}>Tentukan Tanggal Transaksi dan masukkan Nomor Struk Kasir (contoh: <code>STR-00129</code>).</div>
                                        </div>
                                    </div>

                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>2</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Pilih / Scan Obat</div>
                                            <div className={styles.stepDesc}>Scan barcode obat menggunakan tombol Kamera HP atau scanner USB, atau ketik nama obat pada kolom pencarian master database.</div>
                                        </div>
                                    </div>

                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>3</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Input Qty & Harga Satuan</div>
                                            <div className={styles.stepDesc}>Masukkan Jumlah (Qty) yang terjual dan Harga Satuan (Rp) per butir/box. Subtotal otomatis terkalkulasi.</div>
                                        </div>
                                    </div>

                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>4</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Klik &ldquo;+ Tambah ke Struk&rdquo;</div>
                                            <div className={styles.stepDesc}>Item akan masuk ke keranjang Struk Aktif di kolom kanan. Ulangi langkah 2–4 jika struk kasir memuat lebih dari 1 macam obat short ED.</div>
                                        </div>
                                    </div>

                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>5</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Edit / Hapus Item (Jika Perlu)</div>
                                            <div className={styles.stepDesc}>Sebelum menyimpan, Anda dapat mengklik ikon Pensil (✏️) untuk mengedit jumlah/harga atau ikon Tempat Sampah (🗑) untuk membatalkan item.</div>
                                        </div>
                                    </div>

                                    <div className={styles.stepItem}>
                                        <div className={styles.stepNumber}>6</div>
                                        <div className={styles.stepContent}>
                                            <div className={styles.stepTitle}>Simpan Struk Kasir</div>
                                            <div className={styles.stepDesc}>Klik tombol &ldquo;Simpan Struk&rdquo;. Transaksi akan tersimpan permanen dan muncul di tabel Riwayat Penjualan.</div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.calloutBox}>
                                    <div className={styles.calloutTitle}>
                                        <AlertCircle size={14} />
                                        Pencatatan Penjualan Mandiri
                                    </div>
                                    <div className={styles.calloutText}>
                                        Menyimpan struk penjualan <strong>TIDAK MEMOTONG</strong> angka stok fisik di menu Monitoring Produk ED secara otomatis, karena keduanya merupakan modul pencatatan terpisah.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Menu Scan Barcode & Input Manual */}
                        <div className={styles.guideCard}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardTitle}>
                                    <ScanLine size={18} color="var(--primary)" />
                                    Scan Barcode & Input Data Stok Toko
                                </div>
                                <span className={`${styles.cardBadge} ${styles.cardBadgePrimary}`}>Role Outlet</span>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.cardDescription}>
                                    Memasukkan data ketersediaan fisik stok obat short ED yang ada di apotek:
                                </div>

                                <div className={styles.featureList}>
                                    <div className={styles.featureItem}>
                                        <div className={styles.featureTitle}>
                                            <ScanLine size={14} color="var(--primary)" />
                                            Scan Barcode Cepat
                                        </div>
                                        <div className={styles.featureDesc}>
                                            Gunakan scanner fisik atau kamera smartphone untuk mendeteksi obat dalam 1 detik.
                                        </div>
                                    </div>

                                    <div className={styles.featureItem}>
                                        <div className={styles.featureTitle}>
                                            <ClipboardPen size={14} color="var(--primary)" />
                                            Input Manual & Upload CSV
                                        </div>
                                        <div className={styles.featureDesc}>
                                            Cari nama obat dari Master Produk atau unggah file Excel/CSV untuk input massal ratusan data sekaligus.
                                        </div>
                                    </div>

                                    <div className={styles.featureItem}>
                                        <div className={styles.featureTitle}>
                                            <Activity size={14} color="var(--primary)" />
                                            Monitoring & Edit Stok Toko
                                        </div>
                                        <div className={styles.featureDesc}>
                                            Pantau daftar stok toko per kategori ED, lakukan edit langsung (*inline edit*) jika ada revisi, dan unduh data ke Excel.
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.calloutBox}>
                                    <div className={styles.calloutTitle}>
                                        <ShieldCheck size={14} />
                                        Batas Tanggal Kedaluwarsa (ED)
                                    </div>
                                    <div className={styles.calloutText}>
                                        Sistem menerima input tanggal ED mulai <strong>1 September 2025 hingga 30 September 2027</strong>. Tanggal di luar periode ini otomatis ditolak.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ── SEKSI 3: PANDUAN ROLE AM, PROCUREMENT, BOD ── */}
                {(activeTab === 'ALL' || activeTab === 'AM') && (
                    <div className={styles.guideCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <LayoutDashboard size={18} color="var(--primary)" />
                                Panduan Pengguna Area Manager (AM)
                            </div>
                            <span className={styles.cardBadge}>Role AM</span>
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.cardDescription}>
                                Memonitor dan mengawasi apotek-apotek di bawah wilayah binaan Anda:
                            </div>

                            <div className={styles.featureList}>
                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <LayoutDashboard size={14} color="var(--primary)" />
                                        Dashboard Area Manager
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Melihat total nilai rupiah stok berisiko per cabang di wilayah Anda untuk memprioritaskan tindakan penyelamatan stok.
                                    </div>
                                </div>

                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <Receipt size={14} color="var(--primary)" />
                                        Penjualan Short ED Area
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Memantau rekapitulasi realisasi omzet penjualan dari seluruh cabang binaan dengan filter apotek, periode, dan tombol Unduh Excel.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {(activeTab === 'ALL' || activeTab === 'PROCUREMENT') && (
                    <div className={styles.guideCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <PackageSearch size={18} color="var(--primary)" />
                                Panduan Pengguna Tim Procurement Pusat
                            </div>
                            <span className={styles.cardBadge}>Role Procurement</span>
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.cardDescription}>
                                Mengelola strategi penyelamatan stok short ED nasional:
                            </div>

                            <div className={styles.featureList}>
                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <Activity size={14} color="var(--primary)" />
                                        Dashboard Analitik Nasional
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Grafik makro total nilai risiko stok nasional, sebaran kategori ED, dan Top 10 Apotek dengan eksposur tertinggi.
                                    </div>
                                </div>

                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <FileText size={14} color="var(--primary)" />
                                        Data Stok Batching & Tindakan
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Memantau 120.000+ baris data stok seluruh Indonesia dan menetapkan Status Tindakan (Diskon Khusus, Retur PBF, Relokasi) secara massal.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {(activeTab === 'ALL' || activeTab === 'BOD') && (
                    <div className={styles.guideCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <LayoutDashboard size={18} color="var(--primary)" />
                                Panduan Board of Directors (BOD / Eksekutif)
                            </div>
                            <span className={styles.cardBadge}>Role BOD</span>
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.cardDescription}>
                                Gambaran eksekutif komprehensif untuk pengambilan keputusan strategis:
                            </div>

                            <div className={styles.featureList}>
                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <LayoutDashboard size={14} color="var(--primary)" />
                                        Dashboard Eksekutif BOD
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Ringkasan total nilai rupiah stok berisiko nasional, persentase tindakan, dan tren mitigasi risiko inventori.
                                    </div>
                                </div>

                                <div className={styles.featureItem}>
                                    <div className={styles.featureTitle}>
                                        <Receipt size={14} color="var(--primary)" />
                                        Rekap Penjualan Nasional
                                    </div>
                                    <div className={styles.featureDesc}>
                                        Laporan pendapatan dan realisasi penjualan short ED seluruh Indonesia secara real-time.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── SEKSI 4: TANYA JAWAB (Q&A) & SOLUSI KENDALA ── */}
                <div className={styles.guideCard}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>
                            <HelpCircle size={18} color="var(--primary)" />
                            Tanya Jawab (Q&A) & Solusi Kendala
                        </div>
                        <span className={styles.cardBadge}>
                            {filteredFaqs.length} Pertanyaan
                        </span>
                    </div>

                    <div className={styles.cardBody}>
                        {filteredFaqs.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                Tidak ada pertanyaan yang cocok dengan kata kunci &ldquo;{searchQuery}&rdquo;.
                            </div>
                        ) : (
                            <div className={styles.faqList}>
                                {filteredFaqs.map((faq) => {
                                    const isOpen = openFaq[faq.id];
                                    return (
                                        <div
                                            key={faq.id}
                                            className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleFaq(faq.id)}
                                                className={styles.faqHeader}
                                            >
                                                <div className={styles.faqQuestion}>
                                                    <HelpCircle size={15} color="var(--primary)" />
                                                    {faq.question}
                                                </div>
                                                <ChevronDown
                                                    size={16}
                                                    className={`${styles.faqChevron} ${isOpen ? styles.faqChevronOpen : ''}`}
                                                />
                                            </button>
                                            {isOpen && (
                                                <div className={styles.faqBody}>
                                                    {faq.answer}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
