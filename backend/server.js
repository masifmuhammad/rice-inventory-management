const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const env = require('./config/env');
const { connectDB, closeDB, isDbReady } = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { debugLog } = require('./debugLog');

const app = express();

// Render/Fly/Railway all sit behind a proxy; without this, rate limiting and
// req.ip see the proxy address instead of the client.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------------------------------------------ security */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React writes styles through the CSSOM, but Tailwind's preflight and the
        // chart library still need inline <style> blocks.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", ...env.corsOrigins],
        mediaSrc: ["'self'", 'blob:', 'mediastream:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        // Serving over plain http://PUBLIC_IP until HTTPS is set up. Helmet's
        // default upgrade-insecure-requests would force script/CSS to https://
        // and leave a blank page.
        upgradeInsecureRequests: null,
      },
    },
    // The SPA fetches its own PDFs as blobs; COEP would block them.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    // HSTS only helps once we terminate TLS; sending it on raw HTTP confuses
    // browsers after a failed HTTPS attempt.
    hsts: false,
  })
);

// Explicitly allow mic/camera for the AI assistant. Some mobile WebViews inherit
// a restrictive default that blocks getUserMedia without this header.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self)');
  next();
});

/* ---------------------------------------------------------------------- cors */

// When the API and the SPA ship in one container they share an origin and CORS is
// a no-op. CORS_ORIGINS is only needed for split deployments (e.g. Vercel + API).
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl, health checks, native apps
    if (env.corsOrigins.length === 0) return callback(null, true);
    if (env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  maxAge: 86400,
};
app.use(cors(corsOptions));

/* -------------------------------------------------------------------- basics */

app.use(compression());
// Business logos are uploaded as base64 data URLs, so the default 100kb is too small.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// #region agent log
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const started = Date.now();
  debugLog({
    location: 'server.js:api-request-in',
    message: 'API request received',
    data: { method: req.method, path: req.path, origin: req.headers.origin || null },
    hypothesisId: 'B',
  });
  res.on('finish', () => {
    debugLog({
      location: 'server.js:api-request-out',
      message: 'API request finished',
      data: { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started },
      hypothesisId: 'B',
    });
  });
  next();
});
// #endregion

/* ------------------------------------------------------------------ /api/* */

app.get('/api/health', (req, res) => {
  const ready = isDbReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'OK' : 'DEGRADED',
    database: ready ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/products', require('./routes/products'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/cash-book', require('./routes/cashBook'));
// Superseded by /api/cash-book; kept so older clients keep working.
app.use('/api/cash-withdrawals', require('./routes/cashWithdrawals'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));

// #region agent log
try {
  app.use('/api/ai', require('./routes/ai'));
  debugLog({
    location: 'server.js:ai-routes',
    message: 'AI routes mounted OK',
    data: { openrouterConfigured: Boolean(env.openrouterApiKey) },
    hypothesisId: 'D',
  });
} catch (error) {
  debugLog({
    location: 'server.js:ai-routes',
    message: 'AI routes mount FAILED',
    data: { error: error.message },
    hypothesisId: 'D',
  });
  throw error;
}
// #endregion

app.use('/api', notFound);

/* ----------------------------------------------------------- static frontend */

const resolveClientBuild = () => {
  const candidates = [
    env.clientBuildPath,
    path.join(__dirname, 'public'), // Docker layout
    path.join(__dirname, '..', 'frontend', 'build'), // local dev layout
  ].filter(Boolean);

  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null;
};

const clientBuild = resolveClientBuild();

if (clientBuild) {
  console.log(`📦 Serving frontend from ${clientBuild}`);

  // Hashed filenames are immutable; index.html must never be cached or users get
  // a stale shell pointing at deleted chunks after a deploy.
  app.use(
    express.static(clientBuild, {
      index: false,
      maxAge: '1y',
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );

  app.get('*', (req, res, next) => {
    // Only client routes get the SPA shell. A missing asset must 404 honestly:
    // answering a request for `main.abc123.js` with index.html makes the browser
    // parse HTML as JavaScript ("Unexpected token '<'"), which takes down the
    // whole page instead of one file. That is exactly what happens to a tab that
    // was open across a deploy, when the chunk it asks for has been renamed.
    if (req.path.startsWith('/static/') || path.extname(req.path)) {
      return next();
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientBuild, 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Rice Inventory API', health: '/api/health' });
  });
  app.use(notFound);
}

app.use(errorHandler);

/* ------------------------------------------------------------------- startup */

let server;

const start = async () => {
  // Connect before listening so the first request never races the database.
  await connectDB();

  server = app.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port} (${env.isProduction ? 'production' : 'development'})`);
  });
};

const shutdown = (signal) => () => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  const done = () => process.exit(0);

  if (!server) return done();

  server.close(async () => {
    try {
      await closeDB();
    } catch (_) {
      /* already closed */
    }
    done();
  });

  // Don't let a stuck connection hold the container open forever.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

start().catch((error) => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

module.exports = app;
