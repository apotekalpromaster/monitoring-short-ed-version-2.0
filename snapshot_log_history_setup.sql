-- ============================================================
-- STEP 3: Setup Otomasi Snapshot Stok Short ED ke log_history
-- Jalankan script ini SEKALI di SQL Editor Supabase
-- ============================================================

-- 1. Pastikan tabel log_history ada
-- ============================================================
CREATE TABLE IF NOT EXISTS public.log_history (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_risk_cost NUMERIC(18, 2) NOT NULL DEFAULT 0
);

-- Index untuk query chart tren (ORDER BY snapshot_date)
CREATE INDEX IF NOT EXISTS idx_log_history_date ON public.log_history (snapshot_date ASC);


-- 2. Fungsi: hitung total nilai stok berisiko (ED s/d 30 Sep 2026)
-- ============================================================
-- Logika:
--   - Ambil dari stocks_ed JOIN master_products (via barcode = product_code)
--   - Filter ED >= awal bulan berjalan (exclude terkumpul) DAN ED <= 2026-09-30
--   - Deduplicate per (outlet_code, product_code, batch_id): ambil input_period terbaru
--   - Kalikan qty * unit_cost_with_vat
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_snapshot_risk_cost()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_cost NUMERIC;
    v_cutoff_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;  -- 1 bulan berjalan
    v_cutoff_end   DATE := '2026-09-30';
BEGIN
    -- Deduplicate dulu: per (outlet_code, product_code, batch_id) ambil input_period terbaru
    WITH deduped AS (
        SELECT DISTINCT ON (s.outlet_code, s.product_code, s.batch_id)
            s.outlet_code,
            s.product_code,
            s.batch_id,
            s.ed_date,
            s.qty,
            s.input_period
        FROM stocks_ed s
        WHERE s.ed_date >= v_cutoff_start
          AND s.ed_date <= v_cutoff_end
        ORDER BY s.outlet_code, s.product_code, s.batch_id, s.input_period DESC NULLS LAST
    ),
    costed AS (
        SELECT
            d.qty,
            COALESCE(mp.unit_cost_with_vat, 0) AS unit_cost
        FROM deduped d
        LEFT JOIN master_products mp
            ON TRIM(mp.barcode) = TRIM(d.product_code::TEXT)
    )
    SELECT COALESCE(SUM(qty * unit_cost), 0)
    INTO   v_total_cost
    FROM   costed;

    -- Insert snapshot ke log_history
    INSERT INTO public.log_history (snapshot_date, total_risk_cost)
    VALUES (NOW(), v_total_cost);

    RAISE NOTICE 'Snapshot recorded: total_risk_cost = %', v_total_cost;
END;
$$;


-- 3. Aktifkan pg_cron (jika belum aktif di Supabase dashboard)
-- ============================================================
-- Pastikan extension pg_cron sudah diaktifkan di:
--   Supabase Dashboard → Database → Extensions → pg_cron → Enable
--
-- Kemudian jalankan blok di bawah ini:

SELECT cron.schedule(
    'snapshot_short_ed_monthly',   -- nama job (unik)
    '0 1 21 * *',                  -- CRON: tiap tanggal 21, jam 01:00 UTC (08:00 WIB)
    $cron$ SELECT public.fn_snapshot_risk_cost(); $cron$
);


-- ============================================================
-- UNTUK TESTING MANUAL (jalankan kapan saja di SQL Editor):
-- ============================================================
--   SELECT public.fn_snapshot_risk_cost();
--   SELECT * FROM public.log_history ORDER BY snapshot_date DESC LIMIT 10;


-- ============================================================
-- UNTUK MELIHAT / HAPUS JOB cron yang terdaftar:
-- ============================================================
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('snapshot_short_ed_monthly');
