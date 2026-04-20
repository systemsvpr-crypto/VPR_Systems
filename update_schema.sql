-- Transporters: Make vehicle_number optional
ALTER TABLE transporters ALTER COLUMN vehicle_number DROP NOT NULL;

-- Godowns: Remove City, State, Pincode, Email, and Description
ALTER TABLE godowns DROP COLUMN city;
ALTER TABLE godowns DROP COLUMN state;
ALTER TABLE godowns DROP COLUMN pincode;
ALTER TABLE godowns DROP COLUMN email;
ALTER TABLE godowns DROP COLUMN description;

-- Products: Remove Category and HSN Code
ALTER TABLE products DROP COLUMN category;
ALTER TABLE products DROP COLUMN hsn_code;
