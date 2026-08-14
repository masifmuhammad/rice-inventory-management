require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

/**
 * Validates configuration once at boot. Failing here is much cheaper than
 * discovering a missing JWT_SECRET when the first user tries to log in.
 */
const loadEnv = () => {
  const problems = [];

  if (!process.env.JWT_SECRET) {
    if (isProduction) {
      problems.push(
        'JWT_SECRET is required in production. Generate one with:\n' +
          "    node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
      );
    } else {
      console.warn('⚠️  JWT_SECRET not set — using an insecure development secret.');
      process.env.JWT_SECRET = DEV_SECRET;
    }
  } else if (process.env.JWT_SECRET.length < 32 && isProduction) {
    problems.push('JWT_SECRET must be at least 32 characters in production.');
  }

  if (isProduction && !process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is required in production.');
  }

  if (problems.length) {
    console.error('\n❌ Invalid configuration:\n' + problems.map((p) => `  • ${p}`).join('\n') + '\n');
    process.exit(1);
  }

  return {
    isProduction,
    port: parseInt(process.env.PORT, 10) || 5000,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    databaseUrl: process.env.DATABASE_URL,
    /** Comma-separated list. Empty means "same-origin only", which is the Docker setup. */
    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    clientBuildPath: process.env.CLIENT_BUILD_PATH || null,
    /**
     * The timezone a "day" is measured in for daily report buckets.
     *
     * Timestamps are stored as TIMESTAMPTZ and the container clock is UTC, so
     * without this a sale at 02:00 in Karachi is filed under the previous day —
     * and the dashboard's own timeline, built from local dates, never had a
     * bucket to match it, so today's movement simply never appeared.
     */
    reportTimezone: process.env.REPORT_TIMEZONE || 'Asia/Karachi',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterModelFree: process.env.OPENROUTER_MODEL_FREE || 'openrouter/free',
    openrouterModelPaid: process.env.OPENROUTER_MODEL_PAID || 'meta-llama/llama-3.1-8b-instruct',
    openrouterStt: process.env.OPENROUTER_STT || 'openai/whisper-1',
    openrouterSttFallback: process.env.OPENROUTER_STT_FALLBACK || 'openai/whisper-large-v3',
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:5000',
    openrouterSiteName: process.env.OPENROUTER_SITE_NAME || 'Rice Inventory',
  };
};

module.exports = loadEnv();
