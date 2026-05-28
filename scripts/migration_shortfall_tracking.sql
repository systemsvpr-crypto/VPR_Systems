ALTER TABLE purchase_delivery
  ADD COLUMN IF NOT EXISTS shortfall_qty_kg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shortfall_qty_bags integer DEFAULT 0;
