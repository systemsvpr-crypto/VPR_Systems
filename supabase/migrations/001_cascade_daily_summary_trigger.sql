-- ============================================================================
-- Migration: 001_cascade_daily_summary_trigger
-- Description: Automatically cascades daily_stock_summary regeneration forward
--              whenever stock_management is inserted, updated, or soft-deleted.
--              Uses separate statement-level triggers (one per event type)
--              with transition tables to fire once per SQL statement.
-- ============================================================================

-- Drop any previously created triggers/functions from earlier versions
DROP TRIGGER IF EXISTS trg_stock_mgmt_cascade_daily_summary ON stock_management;
DROP TRIGGER IF EXISTS trg_stock_mgmt_cascade_insert ON stock_management;
DROP TRIGGER IF EXISTS trg_stock_mgmt_cascade_update ON stock_management;
DROP TRIGGER IF EXISTS trg_stock_mgmt_cascade_delete ON stock_management;
DROP FUNCTION IF EXISTS cascade_daily_summary();
DROP FUNCTION IF EXISTS cascade_daily_summary_insert();
DROP FUNCTION IF EXISTS cascade_daily_summary_update();
DROP FUNCTION IF EXISTS cascade_daily_summary_delete();
DROP FUNCTION IF EXISTS cascade_from_date(DATE);

-- Shared helper: regenerate daily_summary from start_date forward to today
CREATE OR REPLACE FUNCTION cascade_from_date(start_date DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE d DATE;
BEGIN
    d := start_date;
    WHILE d <= CURRENT_DATE LOOP
        PERFORM generate_daily_summary(d);
        d := d + INTERVAL '1 day';
    END LOOP;
END;
$$;

-- INSERT trigger: use NEW TABLE transition
CREATE OR REPLACE FUNCTION cascade_daily_summary_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE d DATE;
BEGIN
    SELECT MIN(date) INTO d FROM new_table;
    IF d IS NOT NULL THEN
        PERFORM cascade_from_date(d);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_stock_mgmt_cascade_insert
    AFTER INSERT ON stock_management
    REFERENCING NEW TABLE AS new_table
    FOR EACH STATEMENT
    EXECUTE FUNCTION cascade_daily_summary_insert();

-- UPDATE trigger: use both NEW TABLE and OLD TABLE
CREATE OR REPLACE FUNCTION cascade_daily_summary_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE d DATE;
BEGIN
    SELECT MIN(changed.date) INTO d FROM (
        SELECT date FROM new_table
        UNION
        SELECT date FROM old_table
    ) changed;
    IF d IS NOT NULL THEN
        PERFORM cascade_from_date(d);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_stock_mgmt_cascade_update
    AFTER UPDATE ON stock_management
    REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
    FOR EACH STATEMENT
    EXECUTE FUNCTION cascade_daily_summary_update();

-- DELETE trigger: use OLD TABLE transition
CREATE OR REPLACE FUNCTION cascade_daily_summary_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE d DATE;
BEGIN
    SELECT MIN(date) INTO d FROM old_table;
    IF d IS NOT NULL THEN
        PERFORM cascade_from_date(d);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_stock_mgmt_cascade_delete
    AFTER DELETE ON stock_management
    REFERENCING OLD TABLE AS old_table
    FOR EACH STATEMENT
    EXECUTE FUNCTION cascade_daily_summary_delete();

COMMENT ON FUNCTION cascade_from_date(DATE) IS
    'Helper: regenerates daily_stock_summary from start_date through today.';
COMMENT ON FUNCTION cascade_daily_summary_insert() IS
    'Statement-level AFTER INSERT trigger: cascades daily_summary from the earliest new row date.';
COMMENT ON FUNCTION cascade_daily_summary_update() IS
    'Statement-level AFTER UPDATE trigger: cascades daily_summary from the earliest changed date.';
COMMENT ON FUNCTION cascade_daily_summary_delete() IS
    'Statement-level AFTER DELETE trigger: cascades daily_summary from the earliest deleted row date.';
