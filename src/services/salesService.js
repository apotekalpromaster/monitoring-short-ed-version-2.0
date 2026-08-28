import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

/**
 * salesService.js
 * Modul layanan transaksi dan data penjualan produk Short ED (Sistem Pencatatan Mandiri).
 * Tidak memotong/mengubah data pada tabel stocks_ed.
 */

/**
 * Mencatat transaksi penjualan single-item ke tabel sales_short_ed secara mandiri.
 */
export async function recordShortEdSale({
    outletCode,
    transactionDate,
    receiptNumber,
    productCode,
    qty,
    unitPrice,
    createdBy = ''
}) {
    if (!outletCode) throw new Error('Kode outlet tidak valid.');
    if (!transactionDate) throw new Error('Tanggal transaksi wajib diisi.');
    if (!receiptNumber || !receiptNumber.trim()) throw new Error('Nomor struk kasir wajib diisi.');
    if (!productCode) throw new Error('Kode produk wajib diisi.');
    const numericQty = parseFloat(qty);
    const numericPrice = parseFloat(unitPrice);

    if (isNaN(numericQty) || numericQty <= 0) throw new Error('Jumlah terjual (Qty) harus lebih dari 0.');
    if (isNaN(numericPrice) || numericPrice < 0) throw new Error('Harga satuan tidak boleh negatif.');

    const cleanReceipt = receiptNumber.trim();
    const cleanProduct = String(productCode).trim();
    const inputPeriod = transactionDate.slice(0, 7); // 'YYYY-MM'
    const totalPrice = Math.round(numericQty * numericPrice * 100) / 100;

    // Pure Insert ke tabel sales_short_ed (tanpa memotong stocks_ed)
    const { data: insertedSale, error: insertErr } = await supabase
        .from('sales_short_ed')
        .insert({
            outlet_code: outletCode,
            stock_ed_id: null,
            transaction_date: transactionDate,
            receipt_number: cleanReceipt,
            product_code: cleanProduct,
            batch_id: '-',
            ed_date: null,
            qty: numericQty,
            unit_price: numericPrice,
            total_price: totalPrice,
            input_period: inputPeriod,
            created_by: createdBy
        })
        .select()
        .single();

    if (insertErr) throw insertErr;

    return {
        success: true,
        saleId: insertedSale.id,
        message: 'Penjualan berhasil dicatat.'
    };
}

/**
 * Mencatat transaksi penjualan massal (banyak produk sekaligus dalam 1 nomor struk).
 */
export async function recordBulkShortEdSales({
    outletCode,
    transactionDate,
    receiptNumber,
    items = [],
    createdBy = ''
}) {
    if (!outletCode) throw new Error('Kode outlet tidak valid.');
    if (!transactionDate) throw new Error('Tanggal transaksi wajib diisi.');
    if (!receiptNumber || !receiptNumber.trim()) throw new Error('Nomor struk kasir wajib diisi.');
    if (!items || items.length === 0) throw new Error('Minimal harus ada 1 item obat dalam struk.');

    let totalAmount = 0;
    const results = [];

    for (const item of items) {
        const res = await recordShortEdSale({
            outletCode,
            transactionDate,
            receiptNumber,
            productCode: item.productCode,
            qty: item.qty,
            unitPrice: item.unitPrice,
            createdBy
        });
        results.push(res);
        totalAmount += (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
    }

    return {
        success: true,
        count: items.length,
        totalAmount,
        message: `Berhasil mencatat ${items.length} item penjualan untuk Struk #${receiptNumber.trim()}!`
    };
}

/**
 * Mengambil riwayat penjualan khusus outlet yang sedang login.
 */
export async function fetchOutletSales(outletCode, { period, startDate, endDate } = {}) {
    if (!outletCode) return [];

    let query = supabase
        .from('sales_short_ed')
        .select('*')
        .eq('outlet_code', outletCode)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (period) {
        query = query.eq('input_period', period);
    }
    if (startDate) {
        query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
        query = query.lte('transaction_date', endDate);
    }

    const { data: salesData, error: salesError } = await query;
    if (salesError) throw salesError;
    if (!salesData || salesData.length === 0) return [];

    // Lookup nama produk dari master_products
    const uniqueProductCodes = [...new Set(salesData.map(s => String(s.product_code || '').trim()))].filter(Boolean);
    let productMap = {};

    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            // Lookup berdasarkan barcode
            const { data: pData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('barcode', chunk);

            if (pData) {
                pData.forEach(p => {
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                });
            }

            // Lookup berdasarkan product_code
            const { data: codeData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('product_code', chunk);

            if (codeData) {
                codeData.forEach(p => {
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    return salesData.map(sale => ({
        ...sale,
        master_products: productMap[String(sale.product_code || '').trim()] || null
    }));
}

/**
 * Mengambil data penjualan seluruh outlet di bawah Area Manager tertentu.
 */
export async function fetchAMSales(outletCodes, { period, startDate, endDate } = {}) {
    if (!outletCodes || outletCodes.length === 0) return [];

    let allSales = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        let query = supabase
            .from('sales_short_ed')
            .select('*')
            .in('outlet_code', outletCodes)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (period) query = query.eq('input_period', period);
        if (startDate) query = query.gte('transaction_date', startDate);
        if (endDate) query = query.lte('transaction_date', endDate);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allSales.push(...data);
        if (data.length < pageSize) break;
        page++;
    }

    if (allSales.length === 0) return [];

    // Lookup Master Outlets
    const uniqueOutletCodes = [...new Set(allSales.map(s => s.outlet_code))].filter(Boolean);
    let outletMap = {};
    if (uniqueOutletCodes.length > 0) {
        const { data: outletData } = await supabase
            .from('master_outlets')
            .select('outlet_code, outlet_name')
            .in('outlet_code', uniqueOutletCodes);

        if (outletData) {
            outletData.forEach(o => { outletMap[o.outlet_code] = o.outlet_name; });
        }
    }

    // Lookup Master Products
    const uniqueProductCodes = [...new Set(allSales.map(s => String(s.product_code || '').trim()))].filter(Boolean);
    let productMap = {};
    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            const { data: pData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('barcode', chunk);

            if (pData) {
                pData.forEach(p => {
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                });
            }

            const { data: codeData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('product_code', chunk);

            if (codeData) {
                codeData.forEach(p => {
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    return allSales.map(sale => ({
        ...sale,
        outlet_name: outletMap[sale.outlet_code] || sale.outlet_code,
        master_products: productMap[String(sale.product_code || '').trim()] || null
    }));
}

/**
 * Mengambil data penjualan seluruh apotek secara nasional (untuk BOD / Procurement).
 */
export async function fetchAllSales({ period, startDate, endDate } = {}) {
    let allSales = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        let query = supabase
            .from('sales_short_ed')
            .select('*')
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (period) query = query.eq('input_period', period);
        if (startDate) query = query.gte('transaction_date', startDate);
        if (endDate) query = query.lte('transaction_date', endDate);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allSales.push(...data);
        if (data.length < pageSize) break;
        page++;
    }

    if (allSales.length === 0) return [];

    // Fetch Outlets Map
    const uniqueOutletCodes = [...new Set(allSales.map(s => s.outlet_code))].filter(Boolean);
    let outletMap = {};
    if (uniqueOutletCodes.length > 0) {
        const { data: outletData } = await supabase
            .from('master_outlets')
            .select('outlet_code, outlet_name, am_name')
            .in('outlet_code', uniqueOutletCodes);

        if (outletData) {
            outletData.forEach(o => {
                outletMap[o.outlet_code] = {
                    name: o.outlet_name,
                    amName: o.am_name
                };
            });
        }
    }

    // Fetch Products Map
    const uniqueProductCodes = [...new Set(allSales.map(s => String(s.product_code || '').trim()))].filter(Boolean);
    let productMap = {};
    if (uniqueProductCodes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < uniqueProductCodes.length; i += chunkSize) {
            const chunk = uniqueProductCodes.slice(i, i + chunkSize);

            const { data: pData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('barcode', chunk);

            if (pData) {
                pData.forEach(p => {
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                });
            }

            const { data: codeData } = await supabase
                .from('master_products')
                .select('product_code, barcode, item_description, uom')
                .in('product_code', chunk);

            if (codeData) {
                codeData.forEach(p => {
                    if (p.product_code) productMap[String(p.product_code).trim()] = p;
                    if (p.barcode) productMap[String(p.barcode).trim()] = p;
                });
            }
        }
    }

    return allSales.map(sale => ({
        ...sale,
        outlet_name: outletMap[sale.outlet_code]?.name || sale.outlet_code,
        am_name: outletMap[sale.outlet_code]?.amName || '—',
        master_products: productMap[String(sale.product_code || '').trim()] || null
    }));
}

/**
 * Ekspor data penjualan ke file Excel (.xlsx) dengan SheetJS (Tanpa Nomor Batch dan Tanggal ED).
 */
export function exportSalesToExcel(salesList, { fileName = 'Laporan_Penjualan_Short_ED', isMultiOutlet = false } = {}) {
    if (!salesList || salesList.length === 0) {
        alert('Tidak ada data penjualan untuk diunduh.');
        return;
    }

    let totalQty = 0;
    let totalOmzet = 0;

    const rows = salesList.map((item, idx) => {
        const qty = parseFloat(item.qty) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const totalPrice = parseFloat(item.total_price) || (qty * unitPrice);

        totalQty += qty;
        totalOmzet += totalPrice;

        const rowObj = {
            'No': idx + 1,
        };

        if (isMultiOutlet) {
            rowObj['Nama Apotek'] = item.outlet_name || item.outlet_code;
            rowObj['Kode Outlet'] = item.outlet_code;
            if (item.am_name) rowObj['Area Manager'] = item.am_name;
        }

        rowObj['Tanggal Transaksi'] = item.transaction_date || '—';
        rowObj['Nomor Struk Kasir'] = item.receipt_number || '—';
        rowObj['Kode Produk'] = item.product_code || item.master_products?.barcode || '—';
        rowObj['Nama Produk'] = item.master_products?.item_description || '(Tidak diketahui)';
        rowObj['Jumlah Terjual (Qty)'] = qty;
        rowObj['Harga Satuan (Rp)'] = unitPrice;
        rowObj['Total Penjualan (Rp)'] = totalPrice;
        rowObj['Waktu Input'] = item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '—';

        return rowObj;
    });

    // Baris Grand Total di bawah
    const totalRow = {
        'No': 'GRAND TOTAL',
    };
    if (isMultiOutlet) {
        totalRow['Nama Apotek'] = '';
        totalRow['Kode Outlet'] = '';
        if (salesList[0]?.am_name) totalRow['Area Manager'] = '';
    }
    totalRow['Tanggal Transaksi'] = '';
    totalRow['Nomor Struk Kasir'] = '';
    totalRow['Kode Produk'] = '';
    totalRow['Nama Produk'] = '';
    totalRow['Jumlah Terjual (Qty)'] = totalQty;
    totalRow['Harga Satuan (Rp)'] = '';
    totalRow['Total Penjualan (Rp)'] = totalOmzet;
    totalRow['Waktu Input'] = '';

    rows.push(totalRow);

    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = Object.keys(rows[0] || {}).map(key => {
        const maxLen = Math.max(
            key.length,
            ...rows.map(r => String(r[key] || '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Penjualan Short ED');

    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${fileName}_${timestamp}.xlsx`);
}
