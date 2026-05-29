-- ============================================================================
-- Migration: 002_batch_stock_entry_rpc
-- Description: Provides server-side RPCs to insert or soft-delete multiple
--              stock_management rows atomically within a single DB transaction.
--              Guarantees all-or-nothing semantics for multi-product operations.
-- ============================================================================

-- Batched insert: accepts a JSON array of entry objects and inserts every row
-- inside a single transaction.  Returns the count of rows inserted.
CREATE OR REPLACE FUNCTION batch_create_stock_entries(entries JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    INSERT INTO stock_management (
        entry_id,
        godown_id,
        product_id,
        transaction_type,
        quantity,
        balance_after_transaction,
        reference_number,
        date,
        notes,
        created_by,
        transporter_id,
        lr_number,
        from_location,
        freight_amount,
        product_uuid,
        godown_uuid,
        transaction_time
    )
    SELECT
        elem->>'entry_id',
        elem->>'godown_id',
        elem->>'product_id',
        elem->>'transaction_type',
        COALESCE((elem->>'quantity')::numeric, 0),
        COALESCE((elem->>'balance_after_transaction')::numeric, 0),
        elem->>'reference_number',
        COALESCE((elem->>'date')::date, CURRENT_DATE),
        elem->>'notes',
        elem->>'created_by',
        (elem->>'transporter_id')::uuid,
        elem->>'lr_number',
        NULLIF(elem->>'from_location', ''),
        NULLIF((elem->>'freight_amount')::numeric, 0),
        (elem->>'product_uuid')::uuid,
        (elem->>'godown_uuid')::uuid,
        COALESCE((elem->>'transaction_time')::timestamptz, now())
    FROM jsonb_array_elements(entries) AS elem;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'count', inserted_count);
END;
$$;

COMMENT ON FUNCTION batch_create_stock_entries(JSONB) IS
    'Atomically inserts multiple stock_management rows. All rows succeed or none do.';

-- Batched soft-delete: soft-deletes multiple entries by entry_id atomically.
CREATE OR REPLACE FUNCTION batch_soft_delete_stock_entries(
    entry_ids   TEXT[],
    deleted_by  TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE stock_management
    SET
        deleted_at = now(),
        deleted_by = batch_soft_delete_stock_entries.deleted_by
    WHERE entry_id = ANY(entry_ids)
      AND deleted_at IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'count', updated_count);
END;
$$;

COMMENT ON FUNCTION batch_soft_delete_stock_entries(TEXT[], TEXT) IS
    'Atomically soft-deletes multiple stock_management rows by entry_id.';
