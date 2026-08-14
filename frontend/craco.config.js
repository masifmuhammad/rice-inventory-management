const { GenerateSW } = require('workbox-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  webpack: {
    plugins: {
      // Service worker + API caching in dev caused stale/broken responses after
      // Docker rebuilds. Only enable for production builds.
      add: isProduction
        ? [
            new GenerateSW({
              // A new build must not take over tabs that are already open. The
              // precache cleanup deletes the previous build's chunk files, so
              // claiming a running page leaves it importing chunks that no
              // longer exist the next time the user opens a lazy route.
              // `serviceWorkerRegistration`'s onUpdate prompt does the swap
              // instead, at a moment the user chooses.
              clientsClaim: false,
              skipWaiting: false,
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/api/],
              // Deliberately empty. API responses are per-user and per-business,
              // but Cache Storage is keyed by URL alone — the Authorization
              // header is not part of the key. A cached /api/reports/dashboard
              // would be replayed to the next session on the device, serving one
              // business's figures to another tenant. Offline reads, if they are
              // ever wanted, need a cache scoped per business and purged on sign
              // out and on `rim:business-changed`.
              runtimeCaching: [],
            }),
          ]
        : [],
    },
  },
};
