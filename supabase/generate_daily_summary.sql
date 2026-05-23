-- =============================================================
-- 1. Add unique constraint for ON CONFLICT support
-- =============================================================
ALTER TABLE public.daily_stock_summary
ADD CONSTRAINT daily_stock_summary_unique UNIQUE (date, godown_id, product_id);

-- =============================================================
-- 2. Create the summary generation function
-- =============================================================
CREATE OR REPLACE FUNCTION public.generate_daily_stock_summary()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    target_date date := current_date - 1;
BEGIN
    INSERT INTO public.daily_stock_summary (
        date,
        godown_id,
        product_id,
        opening_stock,
        in_stock,
        out_stock,
        closing_stock
    )
    SELECT
        target_date,
        p.godown_id,
        p.product_id,
        COALESCE(prev.closing_stock, p.closing_quantity - COALESCE(tx.in_qty, 0) + COALESCE(tx.out_qty, 0)) as opening_stock,
        COALESCE(tx.in_qty, 0) as in_stock,
        COALESCE(tx.out_qty, 0) as out_stock,
        p.closing_quantity as closing_stock
    FROM public.products p
    LEFT JOIN (
        SELECT
            product_id,
            loc as godown_id,
            SUM(CASE WHEN type = 'in' THEN q ELSE 0 END) as in_qty,
            SUM(CASE WHEN type = 'out' THEN q ELSE 0 END) as out_qty
        FROM (
            SELECT product_id, godown_id as loc, quantity as q, transaction_type as type
            FROM public.stock_management
            WHERE date = current_date - 1
            UNION ALL
            SELECT product_id, from_location as loc, quantity as q, 'out' as type
            FROM public.stock_management
            WHERE date = current_date - 1 AND from_location IS NOT NULL
        ) sub
        GROUP BY product_id, loc
    ) tx ON p.product_id = tx.product_id AND p.godown_id = tx.godown_id
    LEFT JOIN public.daily_stock_summary prev
        ON prev.date = target_date - 1
        AND prev.godown_id = p.godown_id
        AND prev.product_id = p.product_id
    WHERE p.is_active = true
    ON CONFLICT (date, godown_id, product_id)
    DO UPDATE SET
        opening_stock = EXCLUDED.opening_stock,
        in_stock = EXCLUDED.in_stock,
        out_stock = EXCLUDED.out_stock,
        closing_stock = EXCLUDED.closing_stock,
        created_at = now();
END;
$$;

-- =============================================================
-- 3. Schedule via pg_cron (daily at midnight)
-- =============================================================
SELECT cron.schedule(
    'daily-stock-summary',
    '0 0 * * *',
    'SELECT public.generate_daily_stock_summary()'
);
