-- 1. Find triggers on stock_management
SELECT tgname, tgrelid::regclass, tgfoid::regproc
FROM pg_trigger
WHERE tgrelid = 'stock_management'::regclass AND tgisinternal = false;

-- 2. View the trigger function definition
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_trigger t ON t.tgfoid = p.oid
WHERE t.tgrelid = 'stock_management'::regclass AND t.tgisinternal = false;

-- 3. Once you identify the trigger function, drop and recreate it,
--    replacing opening_stop / closing_stock references with balance_after_transaction
-- Example (adjust names based on step 1 & 2 output):
-- DROP FUNCTION IF EXISTS function_name();
-- DROP TRIGGER IF EXISTS trigger_name ON stock_management;
