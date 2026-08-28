import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    ScanLine, ClipboardPen, Activity,
    LayoutDashboard, PackageSearch, Receipt,
    LogOut, Menu, ChevronDown
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import styles from './MainLayout.module.css';

/**
 * NAV_CONFIG — Menu navigasi sistem Monitoring Short ED v2.0
 */
const NAV_CONFIG = {
    OUTLET: [
        { to: '/outlet/scan', icon: ScanLine, label: 'Scan Barcode' },
        { to: '/outlet/input', icon: ClipboardPen, label: 'Input Data Manual' },
        { to: '/outlet/monitoring', icon: Activity, label: 'Monitoring Produk ED' },
        { to: '/outlet/sales', icon: Receipt, label: 'Penjualan Short ED' },
    ],
    PROCUREMENT: [
        {
            label: 'Menu Procurement',
            icon: PackageSearch,
            subItems: [
                { to: '/procurement/overview', label: 'Dashboard Analitik' },
                { to: '/procurement/data', label: 'Data Stok (Batching)' },
                { to: '/procurement/sales', label: 'Rekap Penjualan' }
            ]
        },
    ],
    BOD: [
        {
            label: 'Menu Procurement',
            icon: PackageSearch,
            subItems: [
                { to: '/procurement/overview', label: 'Dashboard Analitik' },
                { to: '/procurement/data', label: 'Data Stok (Batching)' },
                { to: '/procurement/sales', label: 'Rekap Penjualan' }
            ]
        },
        { to: '/bod', icon: LayoutDashboard, label: 'Dashboard BOD' },
        { to: '/bod/sales', icon: Receipt, label: 'Rekap Penjualan Nasional' },
    ],
    AM: [
        { to: '/am', icon: LayoutDashboard, label: 'Dashboard Area Manager' },
        { to: '/am/sales', icon: Receipt, label: 'Penjualan Short ED Area' },
    ],
};

const ROLE_LABEL = {
    OUTLET: 'Outlet',
    AM: 'Area Manager',
    PROCUREMENT: 'Procurement',
    BOD: 'BOD',
};

function getInitials(name = '') {
    return name.trim().split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export default function MainLayout() {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();

    // Sidebar toggle states
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [openSubMenus, setOpenSubMenus] = useState({});

    const navItems = NAV_CONFIG[user?.role] || [];

    function toggleSidebar() {
        if (window.innerWidth <= 768) {
            setMobileDrawerOpen(prev => !prev);
        } else {
            setDesktopSidebarOpen(prev => !prev);
        }
    }

    function closeSidebar() {
        setMobileDrawerOpen(false);
    }

    function handleLogout() {
        logout();
        navigate('/login', { replace: true });
    }

    useEffect(() => {
        document.body.style.overflow = mobileDrawerOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileDrawerOpen]);

    const SidebarContent = (
        <>
            {/* Branding */}
            <div className={styles.brand}>
                <img
                    src="/alpro-logo.png"
                    alt="Apotek Alpro"
                    style={{ maxHeight: '36px', width: 'auto', objectFit: 'contain', display: 'block' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className={styles.brandName}>Apotek Alpro</div>
                    <div className={styles.brandTagline}>Short ED v2.0</div>
                </div>
            </div>

            {/* Navigation */}
            <nav className={styles.nav} role="navigation">
                <span className={styles.navLabel}>Menu Navigasi</span>
                {navItems.map((item) => {
                    const { to, icon: Icon, label, subItems } = item;

                    if (subItems) {
                        const isOpen = openSubMenus[label];
                        return (
                            <div key={label} className={styles.navGroup}>
                                <button
                                    className={`${styles.navItem} ${isOpen ? styles.navItemOpen : ''}`}
                                    onClick={() => setOpenSubMenus(prev => ({ ...prev, [label]: !prev[label] }))}
                                >
                                    <Icon className={styles.navIcon} size={16} strokeWidth={2} />
                                    {label}
                                    <ChevronDown
                                        size={14}
                                        className={styles.navChevron}
                                        style={{
                                            marginLeft: 'auto',
                                            transition: 'transform 0.2s',
                                            transform: isOpen ? 'rotate(180deg)' : 'none'
                                        }}
                                    />
                                </button>
                                {isOpen && (
                                    <div className={styles.navSubMenu}>
                                        {subItems.map((sub) => (
                                            <NavLink
                                                key={sub.to}
                                                to={sub.to}
                                                end
                                                onClick={closeSidebar}
                                                className={({ isActive }) =>
                                                    `${styles.navSubItem}${isActive ? ` ${styles.active}` : ''}`
                                                }
                                            >
                                                {sub.label}
                                            </NavLink>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <NavLink
                            key={to}
                            to={to}
                            end
                            onClick={closeSidebar}
                            className={({ isActive }) =>
                                `${styles.navItem}${isActive ? ` ${styles.active}` : ''}`
                            }
                        >
                            <Icon className={styles.navIcon} size={16} strokeWidth={2} />
                            {label}
                        </NavLink>
                    );
                })}
            </nav>

            {/* User Profile + Logout (Hanya ada di Side Panel) */}
            <div className={styles.userProfile}>
                <div className={styles.avatar}>{getInitials(user?.name)}</div>
                <div className={styles.userInfo}>
                    <div className={styles.userName}>{user?.name || '—'}</div>
                    <div className={styles.userRole}>{ROLE_LABEL[user?.role] || user?.role}</div>
                </div>
                <button
                    className={styles.logoutBtn}
                    onClick={handleLogout}
                    title="Keluar"
                    aria-label="Logout"
                >
                    <LogOut size={15} strokeWidth={2.2} />
                </button>
            </div>
        </>
    );

    return (
        <div className={styles.shell}>
            {/* ── Sidebar (Fixed Static Navigation, tidak ikut scroll) ── */}
            <aside
                className={`
                    ${styles.sidebar}
                    ${!desktopSidebarOpen ? styles.collapsed : ''}
                    ${mobileDrawerOpen ? styles.open : ''}
                `}
            >
                {SidebarContent}
            </aside>

            {/* ── Overlay backdrop (Mobile only) ── */}
            <div
                className={`${styles.overlay}${mobileDrawerOpen ? ` ${styles.visible}` : ''}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            {/* ── Main Area ── */}
            <div
                className={`
                    ${styles.main}
                    ${!desktopSidebarOpen ? styles.mainExpanded : ''}
                `}
            >
                {/* ── Topbar (Hanya Menu Toggle & Logo) ── */}
                <header className={styles.topbar}>
                    <div className={styles.topbarLeft}>
                        <button
                            className={styles.hamburger}
                            onClick={toggleSidebar}
                            title="Buka / Tutup Side Panel"
                            aria-label="Toggle side panel"
                        >
                            <Menu size={20} />
                        </button>
                        <div className={styles.topbarBrand}>
                            <img
                                src="/alpro-logo.png"
                                alt="Apotek Alpro"
                                className={styles.topbarLogo}
                            />
                            <span className={styles.topbarAppTitle}>Monitoring Short ED</span>
                        </div>
                    </div>
                </header>

                <main className={styles.content}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
