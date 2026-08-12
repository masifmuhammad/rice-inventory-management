/**
 * Explicit proxy so /api always hits the Docker (or local) API on :5000.
 * More reliable on Windows than the package.json "proxy" shorthand alone.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      logLevel: 'warn',
      onError(err, req, res) {
        console.error(`[proxy] ${req.method} ${req.url} → ${err.code || err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: 'Cannot reach the API on port 5000. Is Docker running? (docker compose up)',
              code: 'PROXY_API_DOWN',
            })
          );
        }
      },
    })
  );
};
