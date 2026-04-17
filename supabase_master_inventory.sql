-- =============================================
-- MASTER INVENTORY TABLES
-- Track daily opening/closing stock per godown
-- =============================================

-- Create daily stock summary table
CREATE TABLE daily_stock_summary (
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
CREATE POLICY "Allow all access to daily_stock_summary" ON daily_stock_summary FOR ALL USING (true);

-- Function to update daily stock summary
CREATE OR REPLACE FUNCTION update_daily_stock_summary(p_date DATE, p_godown_id TEXT, p_product_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_opening_stock DECIMAL(12,2) := 0;
    v_in_stock DECIMAL(12,2) := 0;
    v_out_stock DECIMAL(12,2) := 0;
    v_closing_stock DECIMAL(12,2) := 0;
    v_prev_closing DECIMAL(12,2) := 0;
BEGIN
    -- Get previous day's closing stock as today's opening
    SELECT closing_stock INTO v_opening_stock 
    FROM daily_stock_summary 
    WHERE date = p_date - 1 AND godown_id = p_godown_id AND product_id = p_product_id
    LIMIT 1;

    -- If no previous day, get current stock as opening
    IF v_opening_stock IS NULL OR v_opening_stock = 0 THEN
        SELECT COALESCE(current_stock, 0) INTO v_opening_stock
        FROM product_godown_stock 
        WHERE godown_id = p_godown_id AND product_id = p_product_id;
    END IF;

    -- Calculate in stock for the day
    SELECT COALESCE(SUM(quantity), 0) INTO v_in_stock
    FROM stock_management 
    WHERE date = p_date AND godown_id = p_godown_id AND product_id = p_product_id AND transaction_type = 'in';

    -- Calculate out stock for the day
    SELECT COALESCE(SUM(quantity), 0) INTO v_out_stock
    FROM stock_management 
    WHERE date = p_date AND godown_id = p_godown_id AND product_id = p_product_id AND transaction_type = 'out';

    -- Calculate closing stock
    v_closing_stock := v_opening_stock + v_in_stock - v_out_stock;

    -- Insert or update daily summary
    INSERT INTO daily_stock_summary (date, godown_id, product_id, opening_stock, in_stock, out_stock, closing_stock)
    VALUES (p_date, p_godown_id, p_product_id, v_opening_stock, v_in_stock, v_out_stock, v_closing_stock)
    ON CONFLICT (date, godown_id, product_id) DO UPDATE SET
        opening_stock = EXCLUDED.opening_stock,
        in_stock = EXCLUDED.in_stock,
        out_stock = EXCLUDED.out_stock,
        closing_stock = EXCLUDED.closing_stock;
END;
$$ LANGUAGE plpgsql;