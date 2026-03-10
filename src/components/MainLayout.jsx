import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    ScanLine, ClipboardPen, Activity,
    LayoutDashboard, PackageSearch,
    LogOut, Menu, X, ChevronDown
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import styles from './MainLayout.module.css';

/**
 * NAV_CONFIG — ditranslasi PERSIS dari menu lama (Index.html #menu-page).
 *
 * OUTLET  : Scan Barcode | Input Data Manual | Monitoring Produk ED Dekat
 * PROC    : Menu Procurement
 * BOD     : Menu Procurement | Dashboard BOD
 * AM      : Dashboard Area Manager
 */
const NAV_CONFIG = {
    OUTLET: [
        { to: '/outlet/scan', icon: ScanLine, label: 'Scan Barcode' },
        { to: '/outlet/input', icon: ClipboardPen, label: 'Input Data Manual' },
        { to: '/outlet/monitoring', icon: Activity, label: 'Monitoring Produk ED' },
    ],
    PROCUREMENT: [
        {
            label: 'Menu Procurement',
            icon: PackageSearch,
            subItems: [
                { to: '/procurement/overview', label: 'Dashboard Analitik' },
                { to: '/procurement/data', label: 'Data Stok (Batching)' }
            ]
        },
    ],
    BOD: [
        {
            label: 'Menu Procurement',
            icon: PackageSearch,
            subItems: [
                { to: '/procurement/overview', label: 'Dashboard Analitik' },
                { to: '/procurement/data', label: 'Data Stok (Batching)' }
            ]
        },
        { to: '/bod', icon: LayoutDashboard, label: 'Dashboard BOD' },
    ],
    AM: [
        { to: '/am', icon: LayoutDashboard, label: 'Dashboard Area Manager' },
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
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [openSubMenus, setOpenSubMenus] = useState({});

    const navItems = NAV_CONFIG[user?.role] || [];

    function closeSidebar() { setDrawerOpen(false); }

    function handleLogout() {
        logout();
        navigate('/login', { replace: true });
    }

    useEffect(() => {
        document.body.style.overflow = drawerOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [drawerOpen]);

    const SidebarContent = (
        <>
            {/* Branding */}
            <div className={styles.brand}>
                <img
                    src="/alpro-logo.png"
                    alt="Apotek Alpro"
                    style={{ maxHeight: '40px', width: 'auto', objectFit: 'contain', display: 'block' }}
                />
                {/* Fallback if logo fails to load */}
                <div style={{ display: 'none', flexDirection: 'column' }}>
                    <div className={styles.brandName}>Alpro Short ED</div>
                    <div className={styles.brandTagline}>Monitoring v2.0</div>
                </div>
            </div>

            {/* Navigation */}
            <nav className={styles.nav} role="navigation">
                <span className={styles.navLabel}>Menu</span>
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
                                    <ChevronDown size={14} className={styles.navChevron} style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
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

            {/* User Profile + Logout */}
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
            {/* ── Sidebar (Desktop: sticky | Mobile: Drawer) ── */}
            <aside className={`${styles.sidebar}${drawerOpen ? ` ${styles.open}` : ''}`}>
                {SidebarContent}
            </aside>

            {/* ── Overlay backdrop (Mobile only) ── */}
            <div
                className={`${styles.overlay}${drawerOpen ? ` ${styles.visible}` : ''}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            {/* ── Main Area ── */}
            <div className={styles.main}>
                {/* Mobile sticky header with hamburger */}
                <header className={styles.mobileHeader}>
                    <button
                        className={styles.hamburger}
                        onClick={() => setDrawerOpen((v) => !v)}
                        aria-label={drawerOpen ? 'Tutup menu' : 'Buka menu'}
                    >
                        {drawerOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                    <img
                        src="/alpro-logo.png"
                        alt="Apotek Alpro"
                        style={{ maxHeight: '32px', width: 'auto', objectFit: 'contain', display: 'block' }}
                    />
                </header>

                <main className={styles.content}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
