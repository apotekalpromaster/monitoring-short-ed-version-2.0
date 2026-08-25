-- ============================================================
-- SETUP TABEL PENJUALAN SHORT ED & RPC ATOMIK (FIXED DATA TYPE)
-- Jalankan di SQL Editor Supabase (https://wjbyrbbqumqpbqhkdpus.supabase.co)
-- ============================================================

-- 1. Buat Tabel sales_short_ed
CREATE TABLE IF NOT EXISTS public.sales_short_ed (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_code       VARCHAR(50) NOT NULL,
    stock_ed_id       TEXT REFERENCES public.stocks_ed(id) ON DELETE SET NULL,
    transaction_date  DATE NOT NULL,
    receipt_number    VARCHAR(100) NOT NULL,
    product_code      VARCHAR(100) NOT NULL,
    batch_id          VARCHAR(100) NOT NULL,
    ed_date           DATE,
    qty               NUMERIC(12, 2) NOT NULL CHECK (qty > 0),
    unit_price        NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    total_price       NUMERIC(15, 2) NOT NULL,
    input_period      VARCHAR(7) NOT NULL,
    created_by        VARCHAR(100),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks performa query laporan & filter periode
CREATE INDEX IF NOT EXISTS idx_sales_outlet_date ON public.sales_short_ed (outlet_code, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_period ON public.sales_short_ed (input_period);
CREATE INDEX IF NOT EXISTS idx_sales_product ON public.sales_short_ed (product_code, batch_id);

-- Enable RLS & Buat Permissive Policy untuk Public Anon Key
ALTER TABLE public.sales_short_ed ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sales_short_ed' AND policyname = 'Allow public access'
    ) THEN
        CREATE POLICY "Allow public access" ON public.sales_short_ed
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 2. Fungsi / RPC Atomik Pencatatan Penjualan + Pemotongan Stok
CREATE OR REPLACE FUNCTION public.fn_record_short_ed_sale(
    p_outlet_code       VARCHAR,
    p_stock_ed_id       TEXT,
    p_transaction_date  DATE,
    p_receipt_number    VARCHAR,
    p_product_code      VARCHAR,
    p_batch_id          VARCHAR,
    p_ed_date           DATE,
    p_qty               NUMERIC,
    p_unit_price        NUMERIC,
    p_created_by        VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_stock NUMERIC;
    v_total_price   NUMERIC;
    v_sale_id       UUID;
    v_target_stock_id TEXT := p_stock_ed_id;
BEGIN
    -- 1. Validasi keberadaan data di stocks_ed
    IF v_target_stock_id IS NOT NULL THEN
        SELECT qty INTO v_current_stock
        FROM public.stocks_ed
        WHERE id = v_target_stock_id AND outlet_code = p_outlet_code
        FOR UPDATE;
    ELSE
        -- Fallback pencarian berbasis outlet + product + batch jika ID tidak disertakan
        SELECT id, qty INTO v_target_stock_id, v_current_stock
        FROM public.stocks_ed
        WHERE outlet_code = p_outlet_code 
          AND product_code = p_product_code 
          AND UPPER(batch_id) = UPPER(p_batch_id)
        ORDER BY ed_date ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Data stok produk dengan batch tersebut tidak ditemukan di sistem monitoring apotek.';
    END IF;

    IF v_current_stock < p_qty THEN
        RAISE EXCEPTION 'Jumlah penjualan (%) melebihi sisa stok yang tercatat (%).', p_qty, v_current_stock;
    END IF;

    -- 2. Hitung total harga
    v_total_price := ROUND(p_qty * p_unit_price, 2);

    -- 3. Simpan baris transaksi penjualan
    INSERT INTO public.sales_short_ed (
        outlet_code,
        stock_ed_id,
        transaction_date,
        receipt_number,
        product_code,
        batch_id,
        ed_date,
        qty,
        unit_price,
        total_price,
        input_period,
        created_by
    ) VALUES (
        p_outlet_code,
        v_target_stock_id,
        p_transaction_date,
        TRIM(p_receipt_number),
        TRIM(p_product_code),
        UPPER(TRIM(p_batch_id)),
        p_ed_date,
        p_qty,
        p_unit_price,
        v_total_price,
        TO_CHAR(p_transaction_date, 'YYYY-MM'),
        p_created_by
    )
    RETURNING id INTO v_sale_id;

    -- 4. Kurangi stok di stocks_ed secara real-time
    UPDATE public.stocks_ed
    SET qty = qty - p_qty
    WHERE id = v_target_stock_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'remaining_stock', v_current_stock - p_qty,
        'message', 'Penjualan berhasil dicatat dan stok monitoring telah diperbarui.'
    );
END;
$$;
