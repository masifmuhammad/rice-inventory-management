const fs = require('fs');
const path = require('path');
const { getPool } = require('../config/db');

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

const runMigrations = async () => {
  const pool = await getPool().connect();
  try {
    // Overlapping Render deploys must not race CREATE/ALTER statements.
    await pool.query('SELECT pg_advisory_lock(74109213)');

    // Existing single-tenant databases need business columns before schema indexes run.
    if ((await tableExists(pool, 'users')) && !(await columnExists(pool, 'users', 'business_id'))) {
      console.log('⬆️  Upgrading database for multi-tenancy…');
      const { upgradeMultitenancy } = require('./migrate-multitenancy');
      await upgradeMultitenancy(pool);
    }

    if ((await tableExists(pool, 'users')) && !(await columnExists(pool, 'users', 'avatar'))) {
      console.log('⬆️  Adding user avatar column…');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT');
    }

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    // Active traffic can hold row/table locks while a deployment expands the
    // schema. Retry only PostgreSQL's rolled-back deadlock/serialization cases;
    // the schema is additive/idempotent and other failures stay visible.
    for (let attempt = 0; ; attempt++) {
      try { await pool.query(sql); break; }
      catch (error) {
        if (!['40P01', '40001'].includes(error.code) || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock(74109213)').catch(() => {});
    pool.release();
  }
};

module.exports = { runMigrations };
