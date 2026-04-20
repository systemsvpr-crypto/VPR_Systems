-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.daily_stock_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  godown_id text NOT NULL,
  product_id text NOT NULL,
  opening_stock numeric DEFAULT 0,
  in_stock numeric DEFAULT 0,
  out_stock numeric DEFAULT 0,
  closing_stock numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_stock_summary_pkey PRIMARY KEY (id)
);
CREATE TABLE public.godowns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  godown_id text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  pincode text,
  contact_person text,
  contact_number text,
  email text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT godowns_pkey PRIMARY KEY (id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  description text,
  unit text,
  hsn_code text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  opening_quantity numeric DEFAULT 0,
  closing_quantity numeric DEFAULT 0,
  mux text,
  godown_id text,
  quantity numeric DEFAULT 0,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_godown_id_fkey FOREIGN KEY (godown_id) REFERENCES public.godowns(godown_id)
);
CREATE TABLE public.stock_management (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id text NOT NULL UNIQUE,
  godown_id text NOT NULL,
  product_id text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text])),
  quantity numeric NOT NULL,
  opening_stock numeric,
  closing_stock numeric,
  reference_number text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  transporter_id uuid,
  lr_number character varying,
  from_location text,
  freight_amount numeric,
  CONSTRAINT stock_management_pkey PRIMARY KEY (id),
  CONSTRAINT stock_management_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.transporters(transporter_id),
  CONSTRAINT stock_management_from_location_fkey FOREIGN KEY (from_location) REFERENCES public.godowns(godown_id)
);
CREATE TABLE public.stock_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_type text NOT NULL CHECK (notification_type = ANY (ARRAY['stock_in'::text, 'stock_out'::text, 'low_stock'::text])),
  title text NOT NULL,
  message text NOT NULL,
  product_id text,
  godown_id text,
  related_id text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transporters (
  transporter_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  vehicle_number character varying NOT NULL,
  driver_phone character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transporters_pkey PRIMARY KEY (transporter_id)
);
CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  designation text,
  date_of_birth date,
  gender text,
  email text,
  phone_number text,
  current_address text,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  role text,
  is_active boolean DEFAULT true,
  profile_picture text,
  page_access ARRAY DEFAULT '{}'::text[],
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text),
  CONSTRAINT users_pkey PRIMARY KEY (user_id)
);