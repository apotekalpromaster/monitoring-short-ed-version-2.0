import { supabase } from './supabaseClient';

/**
 * Mengambil daftar outlet yang dikelola oleh Area Manager tertentu.
 * Berdasarkan logic login, role AM memiliki user.name yang merujuk ke am_name di master_outlets.
 */
export async function fetchAMOutlets(amName) {
    if (!amName) return [];

    const { data, error } = await supabase
        .from('master_outlets')
        .select('outlet_code, outlet_name')
        .eq('am_name', amName)
        .order('outlet_name', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Mengambil semua data stok dari beberapa outlet sekaligus.
 * Untuk mencegah N+1 Query.
 */
export async function fetchAMStocks(outletCodes) {
    if (!outletCodes || outletCodes.length === 0) return [];

    // 1. Ambil data dari stocks_ed (dengan paginasi untuk melewati batas 1000 baris)
    let allStocks = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('stocks_ed')
            .select(`id, outlet_code, product_code, batch_id, ed_date, qty, remark, input_period, status_action, rekomendasi`)
            .in('outlet_code', outletCodes)
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
