CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses (is_active, name);

CREATE TABLE IF NOT EXISTS ledger_requests (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scope VARCHAR(40) NOT NULL,
  request_id UUID NOT NULL,
  request_data JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, scope, request_id)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE RESTRICT,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'accountant', 'worker')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  status_reason VARCHAR(200),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  sessions_valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45),
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_business_status ON users (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_status_created ON users (status, created_at DESC);

CREATE TABLE IF NOT EXISTS business_admin_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_business_admin_memberships_business ON business_admin_memberships (business_id);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(40),
  category VARCHAR(30) NOT NULL DEFAULT 'Other',
  description TEXT,
  unit VARCHAR(10) NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'ton', 'bag', 'sack')),
  current_stock NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock_level NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  max_stock_level NUMERIC(14, 4),
  cost_price NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  location VARCHAR(120),
  batch_number VARCHAR(80),
  expiry_date TIMESTAMPTZ,
  supplier VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_business_active ON products (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_business_stock ON products (business_id, current_stock);
CREATE INDEX IF NOT EXISTS idx_products_business_name ON products (business_id, name);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('stock_in', 'stock_out', 'adjustment', 'transfer')),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity >= 0),
  unit VARCHAR(10) NOT NULL CHECK (unit IN ('kg', 'ton', 'bag', 'sack')),
  price NUMERIC(14, 4) CHECK (price >= 0),
  total_value NUMERIC(14, 4) CHECK (total_value >= 0),
  reference VARCHAR(120),
  batch_number VARCHAR(80),
  expiry_date TIMESTAMPTZ,
  supplier VARCHAR(120),
  customer VARCHAR(120),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stock_before NUMERIC(14, 4) NOT NULL,
  stock_after NUMERIC(14, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_business_created ON transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_product_created ON transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_created ON transactions (type, created_at DESC);

-- Labels identify physical packs, not interchangeable copies of a product SKU.
-- Creating/printing a prepared label does not change stock.
CREATE TABLE IF NOT EXISTS barcode_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  request_data JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, request_id)
);

CREATE TABLE IF NOT EXISTS barcode_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES barcode_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  code VARCHAR(18) NOT NULL UNIQUE,
  product_name VARCHAR(120) NOT NULL,
  sku VARCHAR(40),
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(10) NOT NULL CHECK (unit IN ('kg', 'ton', 'bag', 'sack')),
  batch_number VARCHAR(80),
  expiry_date DATE,
  status VARCHAR(12) NOT NULL CHECK (status IN ('prepared', 'in_stock', 'stock_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_barcode_labels_product_status ON barcode_labels (business_id, product_id, status);
-- Upgrade existing installations as well as fresh databases.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='barcode_labels'::regclass
    AND conname='barcode_labels_status_check' AND pg_get_constraintdef(oid) LIKE '%cancelled%') THEN
    ALTER TABLE barcode_labels DROP CONSTRAINT IF EXISTS barcode_labels_status_check;
    ALTER TABLE barcode_labels ADD CONSTRAINT barcode_labels_status_check
      CHECK (status IN ('prepared', 'in_stock', 'stock_out', 'cancelled'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_barcode_batches_created ON barcode_batches (business_id, created_at DESC);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS barcode_label_id UUID REFERENCES barcode_labels(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_transactions_barcode_label ON transactions (barcode_label_id, created_at DESC);

-- Persist the acknowledgement so retrying a timed-out scan cannot repeat it.
CREATE TABLE IF NOT EXISTS barcode_operations (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_data JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, request_id)
);

-- Preserve the cost basis of new movements when a product price changes later.
-- Old movements remain nullable because their historical cost cannot be recovered.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_price_snapshot NUMERIC(14, 4);

CREATE TABLE IF NOT EXISTS cash_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
  category VARCHAR(60) NOT NULL DEFAULT 'Other income',
  purpose VARCHAR(200) NOT NULL,
  party VARCHAR(80),
  reference VARCHAR(80),
  notes VARCHAR(500),
  source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sale')),
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  migrated_from UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_entries_migrated_from
  ON cash_entries (migrated_from) WHERE migrated_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_entries_business_occurred ON cash_entries (business_id, occurred_at DESC);

-- Customer credit is separate from cash. Existing sales keep their cash behavior.
CREATE TABLE IF NOT EXISTS credit_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_customer_name ON credit_customers (business_id, lower(name));
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type VARCHAR(10) NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'credit'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_received NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES credit_customers(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE TABLE IF NOT EXISTS credit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES credit_customers(id) ON DELETE RESTRICT,
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description VARCHAR(200) NOT NULL,
  due_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_charges_customer ON credit_charges (business_id, customer_id, due_date);
ALTER TABLE credit_charges ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE credit_charges ADD COLUMN IF NOT EXISTS void_reason VARCHAR(300);
ALTER TABLE credit_charges ADD COLUMN IF NOT EXISTS charge_type VARCHAR(10) NOT NULL DEFAULT 'opening' CHECK (charge_type IN ('opening','sale'));
UPDATE credit_charges SET charge_type='sale' WHERE transaction_id IS NOT NULL AND charge_type='opening';
CREATE TABLE IF NOT EXISTS credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES credit_customers(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other')),
  reference VARCHAR(120) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  void_reason VARCHAR(300),
  UNIQUE (business_id, request_id)
);
CREATE TABLE IF NOT EXISTS credit_allocations (
  payment_id UUID NOT NULL REFERENCES credit_payments(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES credit_charges(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payment_id, charge_id)
);
CREATE INDEX IF NOT EXISTS idx_credit_allocations_charge ON credit_allocations (charge_id);
ALTER TABLE cash_entries DROP CONSTRAINT IF EXISTS cash_entries_source_check;
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_source_check CHECK (source IN ('manual', 'sale', 'credit', 'supplier'));
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS credit_payment_id UUID UNIQUE REFERENCES credit_payments(id) ON DELETE RESTRICT;

-- Supplier accounts are additive: historical free-text suppliers and stock
-- receipts remain unchanged. Every new bill/payment retains reversal history.
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_name ON suppliers (business_id, lower(name));
CREATE TABLE IF NOT EXISTS supplier_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  request_id UUID,
  request_payload JSONB,
  charge_type VARCHAR(10) NOT NULL CHECK (charge_type IN ('opening','purchase')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description VARCHAR(200) NOT NULL,
  reference VARCHAR(120) NOT NULL DEFAULT '',
  due_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  void_reason VARCHAR(300),
  UNIQUE (business_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_charges_account ON supplier_charges (business_id, supplier_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_bill_reference ON supplier_charges (business_id, supplier_id, lower(reference))
  WHERE charge_type='purchase' AND voided_at IS NULL AND reference<>'';
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash','bank','easypaisa','jazzcash','other')),
  reference VARCHAR(120) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  void_reason VARCHAR(300),
  UNIQUE (business_id, request_id)
);
CREATE TABLE IF NOT EXISTS supplier_allocations (
  payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES supplier_charges(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payment_id, charge_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_allocations_charge ON supplier_allocations(charge_id);
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS supplier_payment_id UUID UNIQUE REFERENCES supplier_payments(id) ON DELETE RESTRICT;
-- NULL means an older entry whose account was not recorded. Never relabel it
-- as physical cash: known repayment methods are the only safe backfill.
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS payment_method VARCHAR(12)
  CHECK (payment_method IN ('cash','bank','easypaisa','jazzcash','other'));
UPDATE cash_entries e SET payment_method=p.method FROM credit_payments p
  WHERE e.credit_payment_id=p.id AND e.business_id=p.business_id AND e.payment_method IS NULL;

-- Sale references/customer names accept 120 characters on transactions too.
ALTER TABLE cash_entries ALTER COLUMN party TYPE VARCHAR(120);
ALTER TABLE cash_entries ALTER COLUMN reference TYPE VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_cash_entries_business_page ON cash_entries (business_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_business_type_created ON transactions (business_id, type, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_name VARCHAR(80) NOT NULL,
  user_role VARCHAR(20),
  action VARCHAR(60) NOT NULL,
  resource_type VARCHAR(40) NOT NULL,
  resource_id UUID,
  summary TEXT,
  details JSONB,
  previous_state JSONB,
  new_state JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs (resource_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  business_name VARCHAR(120) NOT NULL DEFAULT 'My Business',
  business_type VARCHAR(20) NOT NULL DEFAULT 'rice',
  tagline VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  website VARCHAR(255),
  address JSONB NOT NULL DEFAULT '{"country":"Pakistan"}'::jsonb,
  logo TEXT,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#059669',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#10b981',
  currency JSONB NOT NULL DEFAULT '{"code":"PKR","symbol":"Rs."}'::jsonb,
  default_unit VARCHAR(10) NOT NULL DEFAULT 'kg',
  fiscal_year_start INT NOT NULL DEFAULT 1,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Karachi',
  date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  features JSONB NOT NULL DEFAULT '{
    "inventoryTracking": true,
    "cashWithdrawals": true,
    "multipleLocations": false,
    "advancedReporting": true,
    "emailNotifications": false
  }'::jsonb,
  receipt_settings JSONB NOT NULL DEFAULT '{
    "includeTerms": false,
    "footerText": "Thank you for your business!",
    "showLogo": true,
    "receiptPrefix": "INV"
  }'::jsonb,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  setup_steps JSONB NOT NULL DEFAULT '{
    "businessInfo": false,
    "branding": false,
    "firstProduct": false,
    "firstTransaction": false
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin-configured packet buttons; stock and financial history keep using the
-- existing product, transaction and supplier ledgers.
CREATE TABLE IF NOT EXISTS shop_products (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pack_quantity NUMERIC(14,4) NOT NULL CHECK (pack_quantity > 0),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
  button_number INTEGER NOT NULL CHECK (button_number > 0),
  button_label VARCHAR(40) NOT NULL DEFAULT '',
  payment_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_days BETWEEN 0 AND 365),
  colour VARCHAR(12) NOT NULL DEFAULT 'green' CHECK (colour IN ('green','blue','orange','purple','rose')),
  PRIMARY KEY (business_id, product_id),
  UNIQUE (business_id, button_number)
);
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS payment_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_days BETWEEN 0 AND 365);
