const { Pool } = require('pg');

const DEFAULT_URI = 'postgresql://postgres:postgres@127.0.0.1:5432/rice_inventory';

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

const isDbReady = () => Boolean(pool);

const closeDB = async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
};

module.exports = { connectDB, closeDB, getPool, isDbReady };
