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
  const pool = getPool();

  // Existing single-tenant databases need business columns before schema indexes run.
  if ((await tableExists(pool, 'users')) && !(await columnExists(pool, 'users', 'business_id'))) {
    console.log('⬆️  Upgrading database for multi-tenancy…');
    const { upgradeMultitenancy } = require('./migrate-multitenancy');
    await upgradeMultitenancy(pool);
  }

  if ((await tableExists(pool, 'users')) && !(await columnExists(pool, 'users', 'avatar'))) {
    console.log('⬆️  Adding user avatar column…');
    await pool.query('ALTER TABLE users ADD COLUMN avatar TEXT');
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
};

module.exports = { runMigrations };
