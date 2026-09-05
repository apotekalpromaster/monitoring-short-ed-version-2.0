-- =========================================================================
-- SQL SETUP: View Rekap Penjualan Nasional untuk Google Sheets & Dashboard
-- Jalankan skrip ini sekali di menu SQL Editor pada Supabase Console
-- =========================================================================

-- 1. Buat / Perbarui View v_sales_short_ed_national
CREATE OR REPLACE VIEW public.v_sales_short_ed_national AS
WITH product_lookup AS (
    -- Deduplikasi master_products jika ada barcode ganda
    SELECT DISTINCT ON (COALESCE(barcode, product_code))
        product_code,
        barcode,
        item_description,
        uom
    FROM public.master_products
    ORDER BY COALESCE(barcode, product_code), product_code
)
SELECT 
    s.id AS id,
    COALESCE(mo.outlet_name, s.outlet_code) AS outlet_name,
    s.outlet_code,
    COALESCE(mo.am_name, '—') AS am_name,
    s.transaction_date,
    s.receipt_number,
    COALESCE(mp.barcode, s.product_code) AS product_code,
    COALESCE(mp.item_description, '(Tidak diketahui)') AS item_description,
    s.qty,
    s.unit_price,
    COALESCE(s.total_price, (s.qty * s.unit_price)) AS total_price,
    s.created_at
FROM public.sales_short_ed s
LEFT JOIN public.master_outlets mo 
    ON mo.outlet_code = s.outlet_code
LEFT JOIN product_lookup mp 
    ON (mp.barcode = s.product_code OR mp.product_code = s.product_code)
ORDER BY s.transaction_date DESC, s.created_at DESC;

-- 2. Berikan izin akses SELECT kepada publik/anon dan authenticated
GRANT SELECT ON public.v_sales_short_ed_national TO anon, authenticated, service_role;
