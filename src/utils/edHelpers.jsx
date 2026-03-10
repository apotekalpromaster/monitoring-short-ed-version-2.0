import React from 'react';

export function getEdCategory(edDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ed = new Date(edDateStr);
    if (isNaN(ed)) return 'unknown';
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (ed < firstOfThisMonth) return 'terkumpul';
    const monthDiff =
        (ed.getFullYear() - today.getFullYear()) * 12
        + (ed.getMonth() - today.getMonth());
    if (monthDiff === 0) return 'bulanIni';
    if (monthDiff >= 1 && monthDiff <= 3) return '1to3';
    if (monthDiff >= 4 && monthDiff <= 6) return '4to6';
    if (monthDiff >= 7 && monthDiff <= 12) return '7to12';
    return 'other';
}

export function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d)
        ? dateStr
        : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function monthsUntilED(edDateStr) {
    const today = new Date();
    const ed = new Date(edDateStr);
    if (isNaN(ed)) return 99;
    return (ed.getFullYear() - today.getFullYear()) * 12 + (ed.getMonth() - today.getMonth());
}

/** Teks/Elemen Rekomendasi (Translasi dari Apps Script lama)
 * @param {object} item - stock record
 * @param {string} categoryKey - ED category key
 * @param {Set<string>} [excludedCodes] - product codes that must NOT show 'Diskon Promosi Khusus'
 */
export function getRekomendasi(item, categoryKey, excludedCodes = new Set()) {
    // Jika Procurement sudah menindak, maka tampilkan status/rekomendasi lengkapnya
    if (item.rekomendasi) {
        // Jika rekomendasi mengandung "Diskon Promosi Khusus" dan produk ini dikecualikan → sembunyikan
        if (
            String(item.rekomendasi).includes('Diskon Promosi Khusus') &&
            excludedCodes.has(String(item.product_code).trim()) &&
            ['1to3', '4to6', '7to12'].includes(categoryKey)
        ) {
            return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Menunggu arahan Procurement</span>;
        }
        return <span style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>Ditinjau: {item.rekomendasi}</span>;
    } else if (item.status_action) {
        if (
            String(item.status_action).includes('Diskon Promosi Khusus') &&
            excludedCodes.has(String(item.product_code).trim()) &&
            ['1to3', '4to6', '7to12'].includes(categoryKey)
        ) {
            return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Menunggu arahan Procurement</span>;
        }
        return <span style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>Ditinjau: {item.status_action}</span>;
    }

    const priceNonMember = item.master_products?.price_non_member;
    const priceDiscounted = item.master_products?.price_discounted;

    if (categoryKey === 'bulanIni') {
        return "Pisahkan di Box ED Untuk STTK";
    } else if (categoryKey === '1to3' || categoryKey === '4to6') {
        // Jika produk dikecualikan dari Diskon Promosi Khusus → skip
        if (excludedCodes.has(String(item.product_code).trim())) {
            return '';
        }
        if (priceNonMember > 0 && priceDiscounted > 0) {
            const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
            return (
                <div style={{ lineHeight: 1.4 }}>
                    Diskon Promosi Khusus<br />
                    <del style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{fmt(priceNonMember)}</del>
                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>➔</span>
                    <strong style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}>{fmt(priceDiscounted)}</strong>
                </div>
            );
        }
    }
    return '';
}

export const CATEGORIES = [
    { key: 'bulanIni', label: 'ED Bulan Berjalan', badge: 'badgeRed', rowAlert: true },
    { key: '1to3', label: 'ED 1–3 Bulan Mendatang', badge: 'badgeAmber', rowAlert: false },
    { key: '4to6', label: 'ED 4–6 Bulan Mendatang', badge: 'badgeBlue', rowAlert: false },
    { key: '7to12', label: 'ED 7–12 Bulan Mendatang', badge: 'badgeBlue', rowAlert: false },
    { key: 'terkumpul', label: 'Sudah Ditarik / Terkumpul', badge: 'badgeGray', rowAlert: false },
    { key: 'other', label: 'ED > 12 Bulan', badge: 'badgeGray', rowAlert: false },
];
