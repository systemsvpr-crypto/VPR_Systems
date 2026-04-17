-- =============================================
-- SEED DATA FOR DAILY STOCK SUMMARY
-- Run these queries to populate initial data
-- =============================================

-- Insert sample daily summary data for today and last few days
INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock) 
SELECT 
    CURRENT_DATE - INTERVAL '1 day' as date,
    godown_id,
    product_id,
    FLOOR(RANDOM() * 50 + 10)::DECIMAL(12,2) as opening_stock,
    FLOOR(RANDOM() * 20)::DECIMAL(12,2) as in_stock,
    FLOOR(RANDOM() * 15)::DECIMAL(12,2) as out_stock,
    FLOOR(RANDOM() * 50 + 10)::DECIMAL(12,2) + FLOOR(RANDOM() * 20)::DECIMAL(12,2) - FLOOR(RANDOM() * 15)::DECIMAL(12,2) as closing_stock
FROM product_godown_stock;

-- Insert today with actual current stock as closing
INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock)
SELECT 
    CURRENT_DATE as date,
    pgs.godown_id,
    pgs.product_id,
    COALESCE(d.opening_stock, 0) as opening_stock,
    FLOOR(RANDOM() * 10)::DECIMAL(12,2) as in_stock,
    FLOOR(RANDOM() * 8)::DECIMAL(12,2) as out_stock,
    COALESCE(pgs.current_stock, 0) as closing_stock
FROM product_godown_stock pgs
LEFT JOIN daily_stock_summary d ON d.godown_id = pgs.godown_id AND d.product_id = pgs.product_id AND d.date = CURRENT_DATE - INTERVAL '1 day'
ON CONFLICT (date, godown_id, product_id) DO NOTHING;

-- Or simpler: manually insert some sample data
INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock) VALUES
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0001', 40, 10, 5, 45),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0002', 10, 5, 2, 13),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0003', 25, 8, 3, 30),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0004', 80, 25, 15, 90),
(CURRENT_DATE, 'GODOWN-0001', 'PROD-0005', 60, 15, 10, 65),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0001', 20, 8, 3, 25),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0004', 40, 12, 8, 44),
(CURRENT_DATE, 'GODOWN-0002', 'PROD-0007', 250, 50, 20, 280),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0001', 15, 5, 2, 18),
(CURRENT_DATE, 'GODOWN-0003', 'PROD-0003', 15, 5, 1, 19),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0001', 12, 8, 4, 16),
(CURRENT_DATE, 'GODOWN-0004', 'PROD-0004', 30, 15, 10, 35)
ON CONFLICT (date, godown_id, product_id) DO NOTHING;