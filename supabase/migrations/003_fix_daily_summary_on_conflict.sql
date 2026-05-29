-- ============================================================================
-- Migration: 003_fix_daily_summary_on_conflict
-- Description: Fixes "no unique constraint matching ON CONFLICT" error in
--              generate_daily_summary(). Two changes:
--   1. Replaces ON CONFLICT with a NOT EXISTS check (belt-and-suspenders).
--   2. Adds a unique constraint on (date, godown_id, product_id) so any
--      future ON CONFLICT usage works.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Step 1: Clean up any accidental duplicate rows that would block the
--         unique constraint from being added.
-- --------------------------------------------------------------------------
DELETE FROM daily_stock_summary
WHERE id IN (
    SELECT d1.id
    FROM daily_stock_summary d1
    JOIN daily_stock_summary d2 ON (
        d1.date = d2.date AND
        d1.godown_id = d2.godown_id AND
        d1.product_id = d2.product_id AND
        d1.id > d2.id
    )
);

-- --------------------------------------------------------------------------
-- Step 2: Add the missing unique constraint
-- --------------------------------------------------------------------------
ALTER TABLE daily_stock_summary
    ADD CONSTRAINT daily_stock_summary_unique_date_godown_product
    UNIQUE (date, godown_id, product_id);

-- --------------------------------------------------------------------------
-- Step 3: Recreate generate_daily_summary without the ON CONFLICT clause.
--         Since we DELETE all rows for target_date at the top, ON CONFLICT
--         is never needed — use NOT EXISTS as the safety net instead.
-- --------------------------------------------------------------------------
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
    -- Aggregate OUT transactions per (godown_id, product_id) for the target date
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
    COALESCE(
      ps.closing_stock,
      GREATEST(0, p.current_stock - COALESCE(ti.total_in, 0) + COALESCE(to2.total_out, 0))
    ) AS opening_stock,
    COALESCE(ti.total_in, 0) AS in_stock,
    COALESCE(to2.total_out, 0) AS out_stock,
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
  AND NOT EXISTS (
    SELECT 1 FROM daily_stock_summary d
    WHERE d.date = target_date
      AND d.godown_id = orphan.godown_id
      AND d.product_id = orphan.product_id
  );
END;
$$;
