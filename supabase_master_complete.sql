-- =============================================
-- MASTER INVENTORY DATABASE SETUP + SEED DATA
-- Run this entire file in Supabase SQL Editor
-- =============================================

-- =============================================
-- CREATE TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS daily_stock_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    godown_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    opening_stock DECIMAL(12,2) DEFAULT 0,
    in_stock DECIMAL(12,2) DEFAULT 0,
    out_stock DECIMAL(12,2) DEFAULT 0,
    closing_stock DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, godown_id, product_id)
);

-- Enable RLS
ALTER TABLE daily_stock_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow all access to daily_stock_summary" ON daily_stock_summary;
CREATE POLICY "Allow all access to daily_stock_summary" ON daily_stock_summary FOR ALL USING (true);

-- =============================================
-- SEED DATA
-- =============================================

INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock) VALUES
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0001', 40, 10, 5, 45),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0002', 10, 5, 2, 13),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0003', 25, 8, 3, 30),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0004', 80, 25, 15, 90),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0005', 60, 15, 10, 65),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0006', 150, 30, 20, 160),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0007', 400, 100, 50, 450),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0008', 60, 20, 10, 70),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0009', 20, 5, 3, 22),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0010', 15, 5, 2, 18),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0001', 20, 8, 3, 25),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0002', 8, 3, 1, 10),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0004', 40, 12, 8, 44),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0005', 30, 10, 5, 35),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0007', 250, 50, 20, 280),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0009', 10, 3, 2, 11),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0001', 15, 5, 2, 18),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0003', 15, 5, 1, 19),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0004', 45, 15, 10, 50),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0007', 300, 80, 30, 350),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0010', 10, 3, 1, 12),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0001', 12, 8, 4, 16),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0002', 6, 2, 1, 7),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0004', 30, 15, 10, 35),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0005', 20, 8, 3, 25),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0007', 200, 40, 20, 220),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0008', 40, 10, 5, 45)
ON CONFLICT (date, godown_id, product_id) DO NOTHING;

-- Verify data
SELECT godown_id, SUM(closing_stock) as total_closing FROM daily_stock_summary WHERE date = CURRENT_DATE GROUP BY godown_id ORDER BY godown_id;