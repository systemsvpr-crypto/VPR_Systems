-- Create transporters table
CREATE TABLE transporters (
  transporter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  vehicle_number VARCHAR(50) NOT NULL,
  driver_phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE transporters ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow read for authenticated users" ON transporters
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users" ON transporters
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users" ON transporters
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow delete for authenticated users" ON transporters
  FOR DELETE TO authenticated USING (true);

-- Add columns to stock_management for Stock In details (text type to match godown_id)
ALTER TABLE stock_management 
ADD COLUMN IF NOT EXISTS transporter_id UUID REFERENCES transporters(transporter_id),
ADD COLUMN IF NOT EXISTS lr_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS from_location TEXT REFERENCES godowns(godown_id),
ADD COLUMN IF NOT EXISTS freight_amount DECIMAL(12,2);
