-- =============================================
-- SEED DATA - INVENTORY MANAGEMENT SYSTEM
-- Run these queries in Supabase SQL Editor
-- =============================================

-- =============================================
-- GODOWNS (Sample Locations)
-- =============================================

INSERT INTO godowns (godown_id, name, address, city, state, pincode, contact_person, contact_number, email, description, is_active) VALUES
('GODOWN-0001', 'Main Warehouse', '123 Industrial Area, Phase 1', 'Mumbai', 'Maharashtra', '400093', 'Rajesh Kumar', '9876543210', 'main@vpr.com', 'Primary storage facility', true),
('GODOWN-0002', 'South Godown', '45 Market Road, Near Bus Stand', 'Chennai', 'Tamil Nadu', '600001', 'Priya Sharma', '9876543211', 'south@vpr.com', 'South regional warehouse', true),
('GODOWN-0003', 'East Depot', '78 Cargo Complex, Port Area', 'Kolkata', 'West Bengal', '700043', 'Amit Patel', '9876543212', 'east@vpr.com', 'Eastern distribution center', true),
('GODOWN-0004', 'Delhi Store', '156 Trade Center, NH-8', 'Delhi', 'Delhi', '110001', 'Sneha Gupta', '9876543213', 'delhi@vpr.com', 'North India hub', true);

-- =============================================
-- PRODUCTS (Sample Items)
-- =============================================

INSERT INTO products (product_id, name, sku, category, description, unit, hsn_code, is_active) VALUES
('PROD-0001', 'Office Chair (Ergonomic)', 'OC-001', 'Furniture', 'Ergonomic office chair with lumbar support', 'pcs', '9401', true),
('PROD-0002', 'Conference Table (6 Seater)', 'CT-002', 'Furniture', '6 seater conference table, wood finish', 'pcs', '9401', true),
('PROD-0003', 'Steel Filing Cabinet', 'FC-003', 'Furniture', '4 drawer steel cabinet', 'pcs', '9403', true),
('PROD-0004', 'LED Monitor 24 inch', 'LM-024', 'Electronics', '24 inch Full HD LED monitor', 'pcs', '8528', true),
('PROD-0005', 'Wireless Keyboard Mouse', 'WKM-005', 'Electronics', 'Wireless keyboard and mouse combo', 'sets', '8471', true),
('PROD-0006', 'Printer Ink Cartridge', 'PIC-006', 'Electronics', 'HP printer ink cartridge black', 'pcs', '8443', true),
('PROD-0007', 'A4 Paper (500 sheets)', 'AP-007', 'Raw Materials', 'A4 white paper, 70 GSM', 'boxes', '4802', true),
('PROD-0008', 'Pen Drive 32GB', 'PFD-008', 'Electronics', '32GB USB pen drive', 'pcs', '8523', true),
('PROD-0009', 'Office Table (Standard)', 'OT-009', 'Furniture', 'Standard office work table', 'pcs', '9401', true),
('PROD-0010', 'Book Shelf', 'BS-010', 'Furniture', '5 tier metal book shelf', 'pcs', '9403', true);

-- =============================================
-- PRODUCT GODOWN STOCK (Initial Stock)
-- =============================================

INSERT INTO product_godown_stock (product_id, godown_id, current_stock) VALUES
-- Main Warehouse (GODOWN-0001)
('PROD-0001', 'GODOWN-0001', 50),
('PROD-0002', 'GODOWN-0001', 15),
('PROD-0003', 'GODOWN-0001', 30),
('PROD-0004', 'GODOWN-0001', 100),
('PROD-0005', 'GODOWN-0001', 75),
('PROD-0006', 'GODOWN-0001', 200),
('PROD-0007', 'GODOWN-0001', 500),
('PROD-0008', 'GODOWN-0001', 80),
('PROD-0009', 'GODOWN-0001', 25),
('PROD-0010', 'GODOWN-0001', 20),
-- South Godown (GODOWN-0002)
('PROD-0001', 'GODOWN-0002', 30),
('PROD-0002', 'GODOWN-0002', 10),
('PROD-0004', 'GODOWN-0002', 50),
('PROD-0005', 'GODOWN-0002', 40),
('PROD-0007', 'GODOWN-0002', 300),
('PROD-0009', 'GODOWN-0002', 15),
-- East Depot (GODOWN-0003)
('PROD-0001', 'GODOWN-0003', 25),
('PROD-0003', 'GODOWN-0003', 20),
('PROD-0004', 'GODOWN-0003', 60),
('PROD-0007', 'GODOWN-0003', 400),
('PROD-0010', 'GODOWN-0003', 15),
-- Delhi Store (GODOWN-0004)
('PROD-0001', 'GODOWN-0004', 20),
('PROD-0002', 'GODOWN-0004', 8),
('PROD-0004', 'GODOWN-0004', 45),
('PROD-0005', 'GODOWN-0004', 30),
('PROD-0007', 'GODOWN-0004', 250),
('PROD-0008', 'GODOWN-0004', 50);

-- =============================================
-- INTERNAL TRANSACTIONS (Sample Transfers)
-- =============================================

INSERT INTO internal_transactions (transaction_id, from_godown_id, to_godown_id, product_id, quantity, transfer_date, notes, status) VALUES
('TRF-20250401-0001', 'GODOWN-0001', 'GODOWN-0002', 'PROD-0001', 10, '2025-04-01', 'Monthly stock transfer', 'completed'),
('TRF-20250402-0002', 'GODOWN-0001', 'GODOWN-0003', 'PROD-0004', 25, '2025-04-02', 'Regional distribution', 'completed'),
('TRF-20250403-0003', 'GODOWN-0002', 'GODOWN-0004', 'PROD-0007', 100, '2025-04-03', 'North zone stock replenishment', 'completed'),
('TRF-20250404-0004', 'GODOWN-0001', 'GODOWN-0004', 'PROD-0005', 15, '2025-04-04', 'Project stock allocation', 'completed'),
('TRF-20250405-0005', 'GODOWN-0003', 'GODOWN-0002', 'PROD-0003', 5, '2025-04-05', 'Inter-regional transfer', 'completed');

-- =============================================
-- STOCK MANAGEMENT (In/Out Entries)
-- =============================================

INSERT INTO stock_management (entry_id, godown_id, product_id, transaction_type, quantity, opening_stock, closing_stock, reference_number, date, notes) VALUES
('STK-20250401-0001', 'GODOWN-0001', 'PROD-0001', 'in', 20, 30, 50, 'PO-2025-001', '2025-04-01', 'Purchase order received'),
('STK-20250401-0002', 'GODOWN-0001', 'PROD-0004', 'in', 50, 50, 100, 'PO-2025-002', '2025-04-01', 'Electronics shipment'),
('STK-20250402-0003', 'GODOWN-0001', 'PROD-0007', 'out', 100, 500, 400, 'DO-2025-001', '2025-04-02', 'Dispatch to branches'),
('STK-20250402-0004', 'GODOWN-0002', 'PROD-0001', 'in', 10, 20, 30, 'PO-2025-003', '2025-04-02', 'Regional intake'),
('STK-20250403-0005', 'GODOWN-0001', 'PROD-0002', 'out', 5, 20, 15, 'DO-2025-002', '2025-04-03', 'Client installation'),
('STK-20250403-0006', 'GODOWN-0003', 'PROD-0007', 'in', 200, 200, 400, 'PO-2025-004', '2025-04-03', 'Bulk paper order'),
('STK-20250404-0007', 'GODOWN-0001', 'PROD-0005', 'in', 30, 45, 75, 'PO-2025-005', '2025-04-04', 'Peripheral restock'),
('STK-20250404-0008', 'GODOWN-0004', 'PROD-0009', 'out', 2, 10, 8, 'DO-2025-003', '2025-04-04', 'Office setup');

-- =============================================
-- STOCK NOTIFICATIONS (Activity Alerts)
-- =============================================

INSERT INTO stock_notifications (notification_type, title, message, product_id, godown_id, related_id) VALUES
('transfer', 'Internal Transfer Completed', '10 units transferred from Main Warehouse to South Godown', 'PROD-0001', 'GODOWN-0001', 'TRF-20250401-0001'),
('transfer', 'Internal Transfer Completed', '25 units transferred from Main Warehouse to East Depot', 'PROD-0004', 'GODOWN-0001', 'TRF-20250402-0002'),
('stock_in', 'Stock Received', '50 units received at Main Warehouse', 'PROD-0004', 'GODOWN-0001', 'STK-20250401-0002'),
('stock_in', 'Stock Received', '20 units received at Main Warehouse', 'PROD-0001', 'GODOWN-0001', 'STK-20250401-0001'),
('stock_out', 'Stock Dispatched', '100 units dispatched from Main Warehouse', 'PROD-0007', 'GODOWN-0001', 'STK-20250402-0003'),
('stock_in', 'Stock Received', '200 units received at East Depot', 'PROD-0007', 'GODOWN-0003', 'STK-20250403-0006'),
('transfer', 'Internal Transfer Completed', '100 units transferred from South Godown to Delhi Store', 'PROD-0007', 'GODOWN-0002', 'TRF-20250403-0003'),
('low_stock', 'Low Stock Alert', 'Stock running low at Delhi Store', 'PROD-0002', 'GODOWN-0004', NULL);

-- =============================================
-- UPDATE users TABLE (Add page_access for existing users)
-- Note: Run this separately if needed
-- =============================================

-- Example: Update a specific user's page access
-- UPDATE users SET page_access = '{"godowns","products","internal-transactions","stock-notifications","stock-management","live-stock-dashboard","my-profile","settings"}' WHERE user_id = 'your-user-id';

-- OR set all existing users as admins (optional)
-- UPDATE users SET page_access = '{"godowns","products","internal-transactions","stock-notifications","stock-management","live-stock-dashboard","my-profile","settings"}' WHERE role = 'ADMIN';