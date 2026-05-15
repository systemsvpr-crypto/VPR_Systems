-- ====================================================================
-- DAILY STOCK SUMMARY CRON JOB SETUP
-- This script replaces the real-time trigger with a midnight cron job.
-- ====================================================================

-- 1. Drop existing trigger and function if they exist
-- Replace 'handle_stock_summary_update' with your actual function name if different
DROP TRIGGER IF EXISTS tr_update_stock_summary ON public.stock_management;
DROP FUNCTION IF EXISTS public.handle_stock_summary_update();

-- 2. Create the daily aggregation function
CREATE OR REPLACE FUNCTION public.record_daily_stock_summary()
RETURNS void AS $$
DECLARE
    target_date date := current_date - 1;
BEGIN
    -- This function calculates the snapshot for the day that just ended (yesterday)
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
        -- Opening stock: try to get from the previous day's summary
        -- Fallback to a calculated opening: closing - in + out
        COALESCE(prev.closing_stock, p.closing_quantity - COALESCE(tx.in_qty, 0) + COALESCE(tx.out_qty, 0)) as opening_stock,
        COALESCE(tx.in_qty, 0) as in_stock,
        COALESCE(tx.out_qty, 0) as out_qty,
        p.closing_quantity as closing_stock
    FROM public.products p
    LEFT JOIN (
        -- Aggregate transactions for yesterday (including transfers)
        SELECT 
            product_id,
            loc as godown_id,
            SUM(CASE WHEN type = 'in' THEN q ELSE 0 END) as in_qty,
            SUM(CASE WHEN type = 'out' THEN q ELSE 0 END) as out_qty
        FROM (
            -- Standard transactions (In/Out/Adjustment)
            -- Note: 'out' is handled where godown_id matches
            SELECT product_id, godown_id as loc, quantity as q, transaction_type as type
            FROM public.stock_management
            WHERE date = current_date - 1
            UNION ALL
            -- Account for transfers as 'out' from the source location
            SELECT product_id, from_location as loc, quantity as q, 'out' as type
            FROM public.stock_management
            WHERE date = current_date - 1 AND from_location IS NOT NULL
        ) sub
        GROUP BY product_id, loc
    ) tx ON p.product_id = tx.product_id AND p.godown_id = tx.godown_id
    LEFT JOIN public.daily_stock_summary prev ON prev.date = target_date - 1 
        AND prev.godown_id = p.godown_id AND prev.product_id = p.product_id
    WHERE p.is_active = true
    ON CONFLICT (date, godown_id, product_id) 
    DO UPDATE SET
        opening_stock = EXCLUDED.opening_stock,
        in_stock = EXCLUDED.in_stock,
        out_stock = EXCLUDED.out_stock,
        closing_stock = EXCLUDED.closing_stock,
        created_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enable pg_cron and schedule the task
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any existing task with this name first to avoid duplicates
-- Using a query to unschedule by jobid to avoid errors if the job doesn't exist
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-stock-summary-snapshot';

-- Schedule to run at 00:05 AM every day
-- This ensures all transactions for the previous day are finished
SELECT cron.schedule(
    'daily-stock-summary-snapshot',
    '5 0 * * *',
    $$ SELECT public.record_daily_stock_summary(); $$
);

-- 4. Initial Run (Optional but recommended)
-- Uncomment the line below to populate data for yesterday immediately
-- SELECT public.record_daily_stock_summary();
