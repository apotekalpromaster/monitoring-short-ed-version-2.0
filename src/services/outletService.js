/**
 * outletService.js
 * Semua operasi Supabase yang berkaitan dengan role Outlet.
 *
 * Catatan penting: Kolom `barcode` pada tabel `master_products` adalah Item Code / Kode Produk sebenarnya.
 */

import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cari produk dari master_products.
 * Pencarian berdasarkan deskripsi (item_description) ATAU barcode (sebagai kode produk).
 */
export async function searchProducts(query) {
    if (!query || query.trim().length < 2) return [];

    const { data, error } = await supabase
        .from('master_products')
        .select('barcode, item_description, uom')
        .or(`item_description.ilike.%${query.trim()}%,barcode.ilike.%${query.trim()}%`)
        .order('item_description', { ascending: true })
        .limit(30);

    if (error) throw error;
    return data || [];
}

/**
 * Cari produk HANYA berdasarkan kolom barcode (yang merupakan Kode Produk sebenarnya).
 * Dipakai oleh scanner fisik dan input kode produk.
 * Mengembalikan objek produk { barcode, item_description, uom } atau null.
 */
export async function searchProductByBarcode(barcodeStr) {
    if (!barcodeStr || !barcodeStr.trim()) return null;
    const value = barcodeStr.trim();

    // HANYA membaca kolom barcode pada tabel master_products
    const { data, error } = await supabase
        .from('master_products')
        .select('barcode, item_description, uom')
        .eq('barcode', value)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCODE EXCLUDE
// ─────────────────────────────────────────────────────────────────────────────

/** Cek apakah product_code ada di tabel procode_exclude. */
export async function isProductExcluded(productCode) {
    const { data, error } = await supabase
        .from('procode_exclude')
        .select('product_code')
        .eq('product_code', productCode)
        .maybeSingle();

    if (error) throw error;
    return data !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCKS ED — WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert data stok baru ke tabel stocks_ed.
 */
export async function saveStockEntry({ outletCode, productCode, batchId, edDate, qty, remark }) {
    // Hardcoded Period Validation: 1 Sep 2025 - 30 Sep 2027
    if (edDate < '2025-09-01' || edDate > '2027-09-30') {
        throw new Error('Tanggal ED di luar periode yang diizinkan (1 Sep 2025 - 30 Sep 2027).');
    }

    const formattedBatch = batchId.trim().toUpperCase();
    const inputPeriod = edDate.slice(0, 7); // "YYYY-MM"

    const { error } = await supabase
        .from('stocks_ed')
        .insert({
            outlet_code: outletCode,
            product_code: productCode,
            batch_id: formattedBatch,
            ed_date: edDate,
            qty: parseFloat(qty),
            remark: remark || '',
            input_period: inputPeriod,
        });

    if (error) throw error;
    return { success: true };
}

/**
 * Insert data stok massal (dari CSV).
 */
export async function saveBulkStockEntries(outletCode, records) {
    if (!records || records.length === 0) return { success: true };

    // Hardcoded Period Validation for Bulk
    const invalidRecords = records.filter(r => r.edDate < '2025-09-01' || r.edDate > '2027-09-30');
    if (invalidRecords.length > 0) {
        throw new Error(`${invalidRecords.length} data ditolak karena di luar periode 1 Sep 2025 - 30 Sep 2027.`);
    }

    const payload = records.map(r => {
        const row = {
            outlet_code: outletCode,
            product_code: r.productCode,
            batch_id: r.batchId.trim().toUpperCase(),
            ed_date: r.edDate,
            qty: parseFloat(r.qty),
            remark: r.remark || '',
            input_period: r.edDate.slice(0, 7)
        };
        if (r.id && r.id.trim() !== '') {
            row.id = r.id.trim();
        }
        return row;
    });

    const CHUNK_SIZE = 500;
    let totalInserted = 0;

    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);

        const { error } = await supabase
            .from('stocks_ed')
            .upsert(chunk, { onConflict: 'id' });

        if (error) {
            console.error(`Error pada chunk ${i} - ${i + CHUNK_SIZE}:`, error);
            throw new Error(`Gagal menyimpan sebagian data (mulai baris ${i + 1}). Silakan coba lagi. Error: ${error.message}`);
        }

        totalInserted += chunk.length;

        if (i + CHUNK_SIZE < payload.length) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    return { success: true, count: totalInserted };
}

/**
 * Update data stok (inline edit).
 */
export async function updateStockEntry(id, { batchId, edDate, qty, remark }) {
    if (edDate < '2025-09-01' || edDate > '2027-09-30') {
        throw new Error('Gagal update: Tanggal ED di luar periode yang diizinkan (1 Sep 2025 - 30 Sep 2027).');
    }

    const formattedBatch = batchId.trim().toUpperCase();
    const inputPeriod = edDate.slice(0, 7);

    const { error } = await supabase
        .from('stocks_ed')
        .update({
            batch_id: formattedBatch,
            ed_date: edDate,
            qty: parseFloat(qty),
            remark: remark || '',
            input_period: inputPeriod
        })
        .eq('id', id);

    if (error) throw error;
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCKS ED — READ
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchOutletStocks(outletCode) {
    let allStocks = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('stocks_ed')
            .select(`id, product_code, batch_id, ed_date, qty, remark, input_period, status_action, created_at, rekomendasi`)
            .eq('outlet_code', outletCode)
            .order('ed_date', { ascending: true })
            .order('id', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allStocks.push(...data);

        if (data.length < pageSize) break;
        page++;
    }

    if (allStocks.length === 0) return [];

    const stocksData = allStocks;
    const uniqueProductCodes = [...new Set(stocksData.map(s => String(s.product_code || '').trim()))].filter(Boolean);

    if (uniqueProductCodes.length === 0) return stocksData;

    let productMap = {};
    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            // Lookup HANYA ke kolom barcode master_products
            const { data: bCodeData } = await supabase
                .from('master_products')
                .select('*')
                .in('barcode', chunk);

            if (bCodeData) {
                bCodeData.forEach(p => {
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    return stocksData.map(stock => {
        const pCodeSearch = String(stock.product_code || '').trim();
        return {
            ...stock,
            master_products: productMap[pCodeSearch] || null
        };
    });
}
