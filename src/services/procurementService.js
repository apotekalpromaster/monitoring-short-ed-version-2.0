import { supabase } from './supabaseClient';

/**
 * Mengambil SELURUH data stok ED dari semua outlet untuk kebutuhan Procurement.
 * Melakukan "join" manual atau sinkronisasi dengan master_outlets agar nama outlet tersedia.
 */
export async function fetchAllProcurementStocks() {
    let allStocks = [];
    let page = 0;
    const pageSize = 1000;

    // Supabase has a default limit (usually 1000 rows), so we need to loop.
    while (true) {
        const { data, error } = await supabase
            .from('stocks_ed')
            .select(`id, outlet_code, product_code, batch_id, ed_date, qty, remark, input_period, status_action, rekomendasi`)
            .order('ed_date', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allStocks.push(...data);

        if (data.length < pageSize) break;
        page++;
    }

    if (allStocks.length === 0) return [];

    // ── DEDUPLICATION: ambil record terbaru per (outlet + product + batch) ──
    // Jika Supabase menyimpan baris yang sama dari beberapa input_period,
    // kita hanya simpan yang input_period-nya paling baru agar qty / cost tidak double-count.
    const dedupMap = {};
    for (const row of allStocks) {
        const key = `${row.outlet_code}__${row.product_code}__${row.batch_id ?? ''}`;
        const existing = dedupMap[key];
        if (!existing || (row.input_period ?? '') > (existing.input_period ?? '')) {
            dedupMap[key] = row;
        }
    }
    const stocksData = Object.values(dedupMap);

    // 2. Kumpulkan outlet_code unik untuk mengambil nama outlet
    const uniqueOutletCodes = [...new Set(stocksData.map(s => s.outlet_code))].filter(Boolean);

    // 3. Kumpulkan product_code unik untuk ambil info produk
    const uniqueProductCodes = [...new Set(stocksData.map(s => String(s.product_code || '').trim()))].filter(Boolean);

    // 4. Fetch Master Outlets
    let outletMap = {};
    if (uniqueOutletCodes.length > 0) {
        const { data: outletData, error: outletError } = await supabase
            .from('master_outlets')
            .select('outlet_code, outlet_name')
            .in('outlet_code', uniqueOutletCodes);

        if (!outletError && outletData) {
            outletData.forEach(o => {
                outletMap[o.outlet_code] = o.outlet_name;
            });
        }
    }

    // 5. Fetch Master Products (Chunked & Aman dari Karakter Spesial)
    let productMap = {};
    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            // Supabase client lebih aman memakai .in() dengan array langsung dibanding .or(string)
            // Kueri HANYA ke kolom barcode sesuai instruksi user (Jangan Ubah Logika ini!)
            // Menggunakan select('*') agar tidak terjadi silent error 400 jika nama kolom (spt supplier/unit_cost_with_vat) salah ketik
            const { data: bCodeData, error: bErr } = await supabase
                .from('master_products')
                .select('*')
                .in('barcode', chunk);

            if (bErr) {
                console.error("Supabase fetch master_products Error:", bErr);
            }

            if (bCodeData) {
                bCodeData.forEach(p => {
                    // productMap mengandalkan barcode sebagai kunci pencocokan utama
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    // 6. Gabungkan semua data
    return stocksData.map(stock => {
        const pCodeSearch = String(stock.product_code || '').trim();
        return {
            ...stock,
            outlet_name: outletMap[stock.outlet_code] || stock.outlet_code,
            master_products: productMap[pCodeSearch] || null
        };
    });
}
