const { Pool, types } = require('pg');

const DEFAULT_URI = 'postgresql://postgres:postgres@127.0.0.1:5432/rice_inventory';

/**
 * NUMERIC columns arrive as strings by default, because a Postgres NUMERIC can
 * hold more precision than a JS number can. Every money and quantity column here
 * is NUMERIC(14,4) — at most ten integer digits — which float64 represents
 * exactly, so the precision argument does not apply to this schema.
 *
 * Leaving them as strings did real damage: `balance += entry.amount` in the cash
 * book concatenated instead of adding, turning a running balance of 500 followed
 * by a 10 withdrawal into the string "0500.0000-10" and then NaN. Every `+` on a
 * money field anywhere in the codebase was one edit away from the same bug, so
 * the conversion belongs here, once, rather than at each call site.
 *
 * 1700 = NUMERIC. 20 (int8/bigint) is deliberately left alone: counts are cast
 * to ::int in their queries, and a stray bigint really can exceed float64.
 */
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));

let pool;

const getPool = () => {
  if (!pool) {
    throw new Error('Database pool is not initialised. Call connectDB() first.');
  }
  return pool;
};

/**
 * Connect to PostgreSQL with bounded retries.
 *
 * Short timeouts keep a hung driver from turning every API call into a 30s spinner.
 */
const connectDB = async ({ retries = 5 } = {}) => {
  const connectionString = process.env.DATABASE_URL || DEFAULT_URI;

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (error) => {
    console.error('⚠️  Unexpected PostgreSQL pool error:', error.message);
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      const { rows } = await client.query('SELECT current_database() AS name');
      client.release();
      console.log(`✅ Connected to PostgreSQL (${rows[0].name})`);

      const { runMigrations } = require('../db/migrate');
      await runMigrations();
      console.log('✅ Database schema ready');

      return pool;
    } catch (error) {
      const isLast = attempt === retries;
      console.error(
        `❌ PostgreSQL connection attempt ${attempt}/${retries} failed: ${error.message}`
      );
      if (isLast) throw error;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
};

/**
 * Runs `fn` inside a single database transaction.
 *
 * Everything in this codebase is autocommit, which is fine for a single INSERT
 * but not for an operation that has to move stock, rewrite a ledger row and
 * re-post a cash entry together. Half of that applying is worse than none of it:
 * the stock and the books disagree, and nothing says which is right.
 *
 * The callback receives the client — every query it makes must use it, or that
 * query runs on a different connection outside the transaction.
 */
const withTransaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const isDbReady = () => Boolean(pool);

const closeDB = async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
};

module.exports = { connectDB, closeDB, getPool, isDbReady, withTransaction };
