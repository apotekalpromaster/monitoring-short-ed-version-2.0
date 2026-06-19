/**
 * outletService.js
 * Semua operasi Supabase yang berkaitan dengan role Outlet.
 *
 * Tabel & kolom (sesuai skema aktual Supabase):
 *
 *  master_products:
 *    product_code (PK), barcode, item_description, status,
 *    procurement_id, supplier, division, uom,
 *    unit_cost_no_vat, unit_cost_with_vat, price_non_member, price_discounted
 *
 *  procode_exclude:
 *    product_code
 *
 *  stocks_ed:
 *    id (PK, uuid auto-gen), outlet_code (FK → master_outlets),
 *    product_code, batch_id, ed_date, qty, remark,
 *    input_period, status_action, created_at
 *
 * Catatan: kolom `unique_id` /TIDAK ADA/ di skema Supabase.
 * PK untuk stocks_ed adalah `id` (UUID, di-generate otomatis oleh Supabase).
 */

import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cari produk dari master_products.
 * Kolom deskripsi produk di Supabase adalah `item_description` (bukan `description`).
 * Pencarian berdasarkan deskripsi ATAU product_code.
 */
export async function searchProducts(query) {
    if (!query || query.trim().length < 2) return [];

    const { data, error } = await supabase
        .from('master_products')
        .select('product_code, barcode, item_description, uom')
        .or(`item_description.ilike.%${query.trim()}%,product_code.ilike.%${query.trim()}%`)
        .order('item_description', { ascending: true })
        .limit(30);

    if (error) throw error;
    return data || [];
}

/**
 * Cari produk berdasarkan kode barcode (bukan nama).
 * Dipakai oleh scanner fisik dan kamera.
 * Mengembalikan objek produk { product_code, barcode, item_description, uom } atau null.
 */
export async function searchProductByBarcode(barcodeStr) {
    if (!barcodeStr || !barcodeStr.trim()) return null;
    const value = barcodeStr.trim();

    // Coba cocokkan ke product_code terlebih dahulu (sesuai data scanner apotek)
    const { data: byCode, error: err1 } = await supabase
        .from('master_products')
        .select('product_code, barcode, item_description, uom')
        .eq('product_code', value)
        .maybeSingle();

    if (err1) throw err1;
    if (byCode) return byCode;

    // Fallback: coba cocokkan ke kolom barcode
    const { data: byBarcode, error: err2 } = await supabase
        .from('master_products')
        .select('product_code, barcode, item_description, uom')
        .eq('barcode', value)
        .maybeSingle();

    if (err2) throw err2;
    return byBarcode; // null jika tidak ditemukan di keduanya
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
 *
 * BERBEDA dengan logika lama (Apps Script):
 *  - Di sistem baru, PK adalah `id` (UUID auto-gen), bukan unique_id komposit.
 *  - Penyimpanan selalu INSERT baru (append). Jika Procurement ingin deduplikasi,
 *    itu dilakukan di layer logika bisnis Procurement, bukan di form Outlet.
 *  - `input_period` diisi dengan format YYYY-MM (period laporan).
 */
export async function saveStockEntry({ outletCode, productCode, batchId, edDate, qty, remark }) {
    // Hardcoded Period Validation: 1 Sep 2025 - 31 Mar 2027
    if (edDate < '2025-09-01' || edDate > '2027-03-31') {
        throw new Error('Tanggal ED di luar periode yang diizinkan (1 Sep 2025 - 31 Mar 2027).');
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
            // id          → auto-generated UUID oleh Supabase (gen_random_uuid)
            // status_action → null by default (diisi oleh Procurement nanti)
        });

    if (error) throw error;
    return { success: true };
}

/**
 * Insert data stok massal (dari CSV).
 * records = array of { productCode, batchId, edDate, qty, remark }
 */
export async function saveBulkStockEntries(outletCode, records) {
    if (!records || records.length === 0) return { success: true };

    // Hardcoded Period Validation for Bulk
    const invalidRecords = records.filter(r => r.edDate < '2025-09-01' || r.edDate > '2027-03-31');
    if (invalidRecords.length > 0) {
        throw new Error(`${invalidRecords.length} data ditolak karena di luar periode 1 Sep 2025 - 31 Mar 2027.`);
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
        // Jika CSV menyertakan ID (kemungkinan hasil download edit) gunakan untuk replace/upsert
        if (r.id && r.id.trim() !== '') {
            row.id = r.id.trim();
        }
        return row;
    });

    // ==========================================
    // CHUNKING ALGORITHM UNTUK MENCEGAH TIMEOUT
    // ==========================================
    const CHUNK_SIZE = 500; // Maksimal 500 baris per HTTP request
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

        // Beri jeda 150ms antar request agar CPU Supabase VM dan PgBouncer punya waktu 'bernapas'
        // Sangat krusial untuk skenario ratusan Outlet upload CSV bersamaan di hari H penutupan.
        if (i + CHUNK_SIZE < payload.length) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    return { success: true, count: totalInserted };
}

/**
 * Update data stok (inline edit).
 * Hanya mengizinkan edit kolom batch_id, ed_date, qty, dan remark.
 */
export async function updateStockEntry(id, { batchId, edDate, qty, remark }) {
    // Hardcoded Period Validation
    if (edDate < '2025-09-01' || edDate > '2027-03-31') {
        throw new Error('Gagal update: Tanggal ED di luar periode yang diizinkan (1 Sep 2025 - 31 Mar 2027).');
    }

    const formattedBatch = batchId.trim().toUpperCase();
    const inputPeriod = edDate.slice(0, 7); // update period in case ED date changes month

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

/**
 * Ambil semua stocks_ed milik outlet yang sedang login,
 * beserta data relasi manual ke master_products untuk mengambil nama dan harga diskon (Rekomendasi).
 * Karena skema SQL tidak mengizinkan JOIN langsung (tidak ada FK product_code), kita merge di JS.
 */
export async function fetchOutletStocks(outletCode) {
    // 1. Ambil data dari stocks_ed (dengan paginasi untuk melewati batas 1000 baris)
    let allStocks = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('stocks_ed')
            .select(`id, product_code, batch_id, ed_date, qty, remark, input_period, status_action, created_at, rekomendasi`)
            .eq('outlet_code', outletCode)
            .order('ed_date', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allStocks.push(...data);

        if (data.length < pageSize) break;
        page++;
    }

    if (allStocks.length === 0) return [];

    const stocksData = allStocks;

    // 2. Kumpulkan semua product_code unik
    const uniqueProductCodes = [...new Set(stocksData.map(s => String(s.product_code || '').trim()))].filter(Boolean);

    if (uniqueProductCodes.length === 0) return stocksData;

    // 3. Ambil data dari master_products (Chunked & Aman dari Karakter Spesial)
    let productMap = {};
    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            // Supabase client lebih aman memakai .in() dengan array langsung dibanding .or(string)
            // Sesuai instruksi User: HANYA HANYA Lookup ke Barcode!
            const { data: bCodeData } = await supabase
                .from('master_products')
                .select('*')
                .in('barcode', chunk);

            if (bCodeData) {
                bCodeData.forEach(p => {
                    // productMap mengandalkan barcode sebagai kunci pencocokan utama
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    // 5. Gabungkan data
    return stocksData.map(stock => {
        const pCodeSearch = String(stock.product_code || '').trim();
        return {
            ...stock,
            master_products: productMap[pCodeSearch] || null
        };
    });
}
