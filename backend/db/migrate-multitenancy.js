/**
 * One-time migration for existing single-tenant databases.
 * Creates a default business, attaches all data, and converts business_settings.
 *
 *   node backend/db/migrate-multitenancy.js
 */
require('../config/env');
const { connectDB, closeDB, getPool } = require('../config/db');

const DEFAULT_BUSINESS_NAME = process.env.MIGRATE_BUSINESS_NAME || process.env.SEED_BUSINESS_NAME || 'Haji Rice Mills';

const slugify = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'haji-rice-mills';

const columnExists = async (pool, table, column) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
};

const tableExists = async (pool, table) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return rows.length > 0;
};

const upgradeMultitenancy = async (pool) => {
  const hasBusinesses = await tableExists(pool, 'businesses');
  if (!hasBusinesses) {
    await pool.query(`
      CREATE TABLE businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(80) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  const hasMemberships = await tableExists(pool, 'business_admin_memberships');
  if (!hasMemberships) {
    await pool.query(`
      CREATE TABLE business_admin_memberships (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, business_id)
      );
    `);
  }

  let businessId;
  const slug = slugify(DEFAULT_BUSINESS_NAME);
  const { rows: existingBusinesses } = await pool.query(
    'SELECT id FROM businesses WHERE slug = $1 LIMIT 1',
    [slug]
  );

  if (existingBusinesses[0]) {
    businessId = existingBusinesses[0].id;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO businesses (name, slug, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
      [DEFAULT_BUSINESS_NAME, slug]
    );
    businessId = rows[0].id;
  }

  const tables = ['users', 'products', 'transactions', 'cash_entries', 'audit_logs'];
  for (const table of tables) {
    const hasCol = await columnExists(pool, table, 'business_id');
    if (!hasCol) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN business_id UUID REFERENCES businesses(id)`);
    }
    await pool.query(`UPDATE ${table} SET business_id = $1 WHERE business_id IS NULL`, [businessId]);
  }

  const { rows: admins } = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
  for (const admin of admins) {
    await pool.query(
      `INSERT INTO business_admin_memberships (user_id, business_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [admin.id, businessId]
    );
  }

  const settingsHasBusinessId = await columnExists(pool, 'business_settings', 'business_id');
  const settingsHasUserId = await columnExists(pool, 'business_settings', 'user_id');

  if (!settingsHasBusinessId) {
    await pool.query(`ALTER TABLE business_settings ADD COLUMN business_id UUID REFERENCES businesses(id)`);
  }

  if (settingsHasUserId) {
    const { rows: settingsRows } = await pool.query('SELECT * FROM business_settings ORDER BY updated_at DESC');
    if (settingsRows.length > 0) {
      const best = settingsRows[0];
      await pool.query(
        `INSERT INTO business_settings (
          business_id, business_name, business_type, tagline, email, phone, website,
          address, logo, primary_color, accent_color, currency, default_unit,
          fiscal_year_start, timezone, date_format, features, receipt_settings,
          onboarding_completed, setup_steps
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (business_id) DO UPDATE SET
          business_name = EXCLUDED.business_name,
          logo = COALESCE(EXCLUDED.logo, business_settings.logo),
          primary_color = EXCLUDED.primary_color,
          accent_color = EXCLUDED.accent_color,
          updated_at = NOW()`,
        [
          businessId,
          best.business_name || DEFAULT_BUSINESS_NAME,
          best.business_type,
          best.tagline,
          best.email,
          best.phone,
          best.website,
          best.address,
          best.logo,
          best.primary_color || '#059669',
          best.accent_color || '#10b981',
          best.currency,
          best.default_unit,
          best.fiscal_year_start,
          best.timezone,
          best.date_format,
          best.features,
          best.receipt_settings,
          best.onboarding_completed,
          best.setup_steps,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO business_settings (business_id, business_name)
         VALUES ($1, $2) ON CONFLICT (business_id) DO NOTHING`,
        [businessId, DEFAULT_BUSINESS_NAME]
      );
    }

    await pool.query('ALTER TABLE business_settings DROP CONSTRAINT IF EXISTS business_settings_user_id_key');
    await pool.query('ALTER TABLE business_settings DROP COLUMN IF EXISTS user_id');
  } else {
    await pool.query(
      `INSERT INTO business_settings (business_id, business_name)
       VALUES ($1, $2) ON CONFLICT (business_id) DO NOTHING`,
      [businessId, DEFAULT_BUSINESS_NAME]
    );
  }

  await pool.query(`ALTER TABLE users ALTER COLUMN business_id SET NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE products ALTER COLUMN business_id SET NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE transactions ALTER COLUMN business_id SET NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE cash_entries ALTER COLUMN business_id SET NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE business_settings ALTER COLUMN business_id SET NOT NULL`).catch(() => {});

  await pool.query('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key').catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_business_sku
    ON products (business_id, sku) WHERE sku IS NOT NULL
  `);

  return businessId;
};

const run = async () => {
  await connectDB({ retries: 3 });
  const pool = getPool();
  await upgradeMultitenancy(pool);
  console.log('✅ Multi-tenancy migration complete.');
  await closeDB();
  process.exit(0);
};

if (require.main === module) {
  run().catch(async (error) => {
    console.error('❌ Migration failed:', error.message);
    try {
      await closeDB();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
}

module.exports = { upgradeMultitenancy, slugify, DEFAULT_BUSINESS_NAME };
