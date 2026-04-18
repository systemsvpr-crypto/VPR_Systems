-- =============================================
-- INVENTORY MANAGEMENT SYSTEM - SUPABASE SCHEMA
-- Run these queries in Supabase SQL Editor
-- =============================================

-- 1. GODOWNS TABLE
CREATE TABLE godowns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    godown_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    contact_person TEXT,
    contact_number TEXT,
    email TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE godowns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for godowns
CREATE POLICY "Allow all access to godowns" ON godowns FOR ALL USING (true);

-- 2. PRODUCTS TABLE
CREATE TABLE products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    description TEXT,
    unit TEXT,
    hsn_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true);

-- 3. PRODUCT_GODOWN_STOCK TABLE (Current stock per product per godown)
CREATE TABLE product_godown_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id TEXT NOT NULL,
    godown_id TEXT NOT NULL,
    current_stock DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, godown_id)
);

-- Enable RLS
ALTER TABLE product_godown_stock ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_godown_stock
CREATE POLICY "Allow all access to product_godown_stock" ON product_godown_stock FOR ALL USING (true);

-- 4. INTERNAL_TRANSACTIONS TABLE (Transfers between godowns)
CREATE TABLE internal_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL,
    from_godown_id TEXT NOT NULL,
    to_godown_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    status TEXT DEFAULT 'completed',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE internal_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for internal_transactions
CREATE POLICY "Allow all access to internal_transactions" ON internal_transactions FOR ALL USING (true);

-- 5. STOCK_MANAGEMENT TABLE (In/Out stock entries)
CREATE TABLE stock_management (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_id TEXT UNIQUE NOT NULL,
    godown_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjustment')),
    quantity DECIMAL(12,2) NOT NULL,
    opening_stock DECIMAL(12,2),
    closing_stock DECIMAL(12,2),
    reference_number TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE stock_management ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stock_management
CREATE POLICY "Allow all access to stock_management" ON stock_management FOR ALL USING (true);

-- 6. STOCK_NOTIFICATIONS TABLE (Transaction notifications)
CREATE TABLE stock_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('transfer', 'stock_in', 'stock_out', 'low_stock')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    product_id TEXT,
    godown_id TEXT,
    related_id TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stock_notifications
CREATE POLICY "Allow all access to stock_notifications" ON stock_notifications FOR ALL USING (true);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to generate Godown ID
CREATE OR REPLACE FUNCTION generate_godown_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    count_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO count_num FROM godowns;
    new_id := 'GODOWN-' || LPAD(count_num::TEXT, 4, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate Product ID
CREATE OR REPLACE FUNCTION generate_product_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    count_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO count_num FROM products;
    new_id := 'PROD-' || LPAD(count_num::TEXT, 4, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate Transaction ID
CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    count_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO count_num FROM internal_transactions;
    new_id := 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(count_num::TEXT, 4, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate Stock Entry ID
CREATE OR REPLACE FUNCTION generate_stock_entry_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    count_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO count_num FROM stock_management;
    new_id := 'STK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(count_num::TEXT, 4, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;