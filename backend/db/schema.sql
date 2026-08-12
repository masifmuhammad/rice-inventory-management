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
