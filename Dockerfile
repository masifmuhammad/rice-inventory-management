# Single image containing the API and the built frontend.
#
# The Express server serves the React build as static files and falls back to
# index.html for client routes, so there is one process, one port and one origin
# — which also means no CORS configuration and no second service to pay for.

# --------------------------------------------------------------- frontend ---
FROM node:20-alpine AS frontend

WORKDIR /app/frontend

# Dependencies are copied first so this layer is reused whenever only source
# files change, which is most of the time.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY frontend/ ./

# Sourcemaps would roughly double the image for no production benefit.
ENV GENERATE_SOURCEMAP=false
# CRA inlines the webpack runtime into index.html by default. The server sends a
# strict `script-src 'self'` policy, which would block that inline script and
# leave a blank page, so keep it as a separate file.
ENV INLINE_RUNTIME_CHUNK=false
# Linting already ran in development; running it here only risks failing a
# deploy on a stylistic warning.
ENV DISABLE_ESLINT_PLUGIN=true

RUN npm run build

# ---------------------------------------------------------- backend deps ---
FROM node:20-alpine AS backend-deps

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------- runtime ---
FROM node:20-alpine AS runtime

# tini reaps zombies and forwards SIGTERM, which is what lets the server shut
# down gracefully instead of being killed mid-request during a deploy.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    CLIENT_BUILD_PATH=/app/public

COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/ ./
COPY --from=frontend /app/frontend/build ./public

# Run as an unprivileged user: a compromised process should not own the filesystem.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
