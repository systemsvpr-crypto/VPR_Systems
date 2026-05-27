-- =============================================================================
-- MIGRATION: Daily Stock Summary — Auto-Generated Snapshots
-- =============================================================================
-- Run this entire file in Supabase SQL Editor (one block at a time).
-- =============================================================================

-- =============================================================================
-- PART 1: Add UNIQUE constraint on (date, godown_id, product_id)
-- =============================================================================
-- This ensures that for a given date, each product+godown combination has
-- exactly ONE summary row. Enables ON CONFLICT ... DO UPDATE (upsert).
--
-- Since the same product_id can exist in multiple godowns (e.g., product
-- "AM BLK 7*14" resides in GODOWN-0003 and GODOWN-0005), the composite key
-- (date, godown_id, product_id) correctly distinguishes them.
-- =============================================================================

ALTER TABLE daily_stock_summary
ADD CONSTRAINT daily_stock_summary_unique_date_product_godown
UNIQUE (date, godown_id, product_id);

-- =============================================================================
-- PART 2: Create the generate_daily_summary function
-- =============================================================================
-- This function computes end-of-day snapshots for every active product in
-- every godown and stores them in daily_stock_summary.
--
-- Logic:
--   1. opening_stock = previous day's closing_stock (from daily_stock_summary)
--      OR (if no previous snapshot) derived backward from current_stock
--   2. in_stock       = sum of 'in' type transactions for that product+godown
--   3. out_stock      = sum of 'out' type transactions for that product+godown
--                      + outgoing transfers where this godown is from_location
--   4. closing_stock  = opening_stock + in_stock - out_stock (min 0)
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_daily_summary(target_date DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  prev_date DATE := target_date - INTERVAL '1 day';
BEGIN
  -- Delete existing entries for target_date (allows re-running for same date)
  DELETE FROM daily_stock_summary WHERE date = target_date;

  -- Insert fresh summaries for all active products with a godown assignment
  INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock)
  WITH
    -- Aggregate IN transactions per (godown_id, product_id) for the target date
    tx_in AS (
      SELECT
        godown_id,
        product_id,
        COALESCE(SUM(quantity), 0) AS total_in
      FROM stock_management
      WHERE date = target_date
        AND transaction_type IN ('in', 'purchase', 'transfer_in', 'return_in', 'opening')
        AND (deleted_at IS NULL)
        AND (is_reversed = false OR is_reversed IS NULL)
      GROUP BY godown_id, product_id
    ),
    -- Aggregate OUT transactions per (godown_id, product_id) for the target date.
    -- Includes: direct out entries (including -SRC transfer source entries),
    -- PLUS incoming entries with from_location that DON'T already have a -SRC counterpart
    -- (to handle legacy transfers without -SRC entries without double-counting).
    tx_out AS (
      SELECT
        godown_id,
        product_id,
        SUM(total_qty) AS total_out
      FROM (
        -- Direct out-type entries (includes -SRC entries for transfers)
        SELECT godown_id, product_id, SUM(quantity) AS total_qty
        FROM stock_management
        WHERE date = target_date
          AND transaction_type IN ('out', 'sale', 'transfer_out', 'dispatch', 'return_out', 'correction')
          AND (deleted_at IS NULL)
          AND (is_reversed = false OR is_reversed IS NULL)
        GROUP BY godown_id, product_id

        UNION ALL

        -- Outgoing transfers via from_location (only for entries WITHOUT a -SRC counterpart)
        SELECT dest.from_location, dest.product_id, SUM(dest.quantity)
        FROM stock_management dest
        WHERE dest.date = target_date
          AND dest.from_location IS NOT NULL
          AND dest.transaction_type IN ('in', 'transfer_in')
          AND (dest.deleted_at IS NULL)
          AND (dest.is_reversed = false OR dest.is_reversed IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM stock_management src
            WHERE src.date = target_date
              AND src.entry_id = dest.entry_id || '-SRC'
              AND src.deleted_at IS NULL
          )
        GROUP BY dest.from_location, dest.product_id
      ) combined
      GROUP BY godown_id, product_id
    ),
    -- Previous day's closing stock per (godown_id, product_id)
    prev_snapshot AS (
      SELECT godown_id, product_id, closing_stock
      FROM daily_stock_summary
      WHERE date = prev_date
    )
  SELECT
    target_date,
    p.godown_id,
    p.product_id,

    -- opening_stock: previous closing OR derived from current_stock
    COALESCE(
      ps.closing_stock,
      GREATEST(0, p.current_stock - COALESCE(ti.total_in, 0) + COALESCE(to2.total_out, 0))
    ) AS opening_stock,

    -- in_stock
    COALESCE(ti.total_in, 0) AS in_stock,

    -- out_stock
    COALESCE(to2.total_out, 0) AS out_stock,

    -- closing_stock = opening + in - out
    GREATEST(0,
      COALESCE(
        ps.closing_stock,
        GREATEST(0, p.current_stock - COALESCE(ti.total_in, 0) + COALESCE(to2.total_out, 0))
      ) + COALESCE(ti.total_in, 0) - COALESCE(to2.total_out, 0)
    ) AS closing_stock

  FROM products p
  LEFT JOIN tx_in ti    ON ti.godown_id = p.godown_id AND ti.product_id = p.product_id
  LEFT JOIN tx_out to2  ON to2.godown_id = p.godown_id AND to2.product_id = p.product_id
  LEFT JOIN prev_snapshot ps ON ps.godown_id = p.godown_id AND ps.product_id = p.product_id
  WHERE p.is_active = true
    AND p.godown_id IS NOT NULL;

  -- Handle products that have transfer-out activity but no longer have an active
  -- product record in the source godown (transferred everything out).
  INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock)
  SELECT
    target_date,
    orphan.godown_id,
    orphan.product_id,
    COALESCE(ps.closing_stock, 0) AS opening_stock,
    0 AS in_stock,
    orphan.total_out,
    GREATEST(0, COALESCE(ps.closing_stock, 0) - orphan.total_out) AS closing_stock
  FROM (
    SELECT godown_id, product_id, SUM(quantity) AS total_out
    FROM stock_management
    WHERE date = target_date
      AND transaction_type IN ('out', 'sale', 'transfer_out', 'dispatch', 'return_out', 'correction')
      AND (deleted_at IS NULL)
      AND (is_reversed = false OR is_reversed IS NULL)
    GROUP BY godown_id, product_id
  ) orphan
  LEFT JOIN (
    SELECT godown_id, product_id, closing_stock
    FROM daily_stock_summary
    WHERE date = prev_date
  ) ps ON ps.godown_id = orphan.godown_id AND ps.product_id = orphan.product_id
  WHERE NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.godown_id = orphan.godown_id AND p.product_id = orphan.product_id AND p.is_active = true
  )
  ON CONFLICT (date, godown_id, product_id) DO NOTHING;
END;
$$;

-- =============================================================================
-- PART 3: Set up the cron job (pg_cron)
-- =============================================================================
-- Schedules the function to run daily at 11:50 PM (just before midnight).
-- This captures the end-of-day snapshot for the CURRENT date.
--
-- If pg_cron extension is not available, skip this block and use Part 4 instead.
-- =============================================================================

-- Step 3a: Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 3b: Schedule the job
SELECT cron.schedule(
  'daily-stock-summary-midnight',  -- job name (use this to manage later)
  '50 23 * * *',                   -- cron: 11:50 PM every day
  $$SELECT generate_daily_summary(CURRENT_DATE)$$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To manually trigger the job for testing:
-- SELECT cron.run_job('daily-stock-summary-midnight');

-- To remove the job:
-- SELECT cron.unschedule('daily-stock-summary-midnight');

-- =============================================================================
-- PART 4: MANUAL RUN — Test the function for a specific date
-- =============================================================================
-- Run this to manually generate the summary for today or any past date:
-- =============================================================================

-- Generate for today (2026-05-27):
-- SELECT generate_daily_summary('2026-05-27');

-- Verify the results:
-- SELECT * FROM daily_stock_summary WHERE date = '2026-05-27' ORDER BY godown_id, product_id;

-- Verify opening = previous day's closing (run after 2+ days of data):
-- SELECT
--   a.date AS today,
--   a.godown_id,
--   a.product_id,
--   a.opening_stock,
--   b.closing_stock AS prev_closing,
--   CASE WHEN a.opening_stock = b.closing_stock THEN '✓ MATCH' ELSE '✗ MISMATCH' END AS status
-- FROM daily_stock_summary a
-- JOIN daily_stock_summary b
--   ON a.product_id = b.product_id
--  AND a.godown_id = b.godown_id
--  AND a.date = b.date + INTERVAL '1 day'
-- ORDER BY a.date, a.godown_id, a.product_id;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
