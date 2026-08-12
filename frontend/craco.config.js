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
              clientsClaim: true,
              skipWaiting: true,
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/api/],
              runtimeCaching: [
                {
                  urlPattern: /\/api\//,
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'api-cache',
                    networkTimeoutSeconds: 8,
                    expiration: { maxEntries: 32, maxAgeSeconds: 300 },
                  },
                },
              ],
            }),
          ]
        : [],
    },
  },
};
