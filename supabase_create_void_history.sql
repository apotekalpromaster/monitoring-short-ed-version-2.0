-- =========================================================================
-- SQL SETUP: Tabel Riwayat Audit Void Penjualan Short ED
-- Jalankan skrip ini sekali di menu SQL Editor pada Supabase Console
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.sales_short_ed_void_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_sale_id UUID,
    outlet_code TEXT NOT NULL,
    transaction_date DATE NOT NULL,
    receipt_number TEXT NOT NULL,
    product_code TEXT NOT NULL,
    batch_id TEXT,
    ed_date DATE,
    qty NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL,
    input_period TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    void_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    void_by TEXT NOT NULL,
    void_reason TEXT NOT NULL,
    void_notes TEXT
);

-- Berikan izin akses penuh ke tabel audit void untuk API web app
GRANT ALL ON public.sales_short_ed_void_history TO anon, authenticated, service_role;

-- Index untuk mempercepat pencarian audit trail berdasarkan outlet dan waktu void
CREATE INDEX IF NOT EXISTS idx_void_history_outlet ON public.sales_short_ed_void_history (outlet_code);
CREATE INDEX IF NOT EXISTS idx_void_history_void_at ON public.sales_short_ed_void_history (void_at DESC);
