# Deployment

The app ships as **one Docker image**: Express serves the API under `/api` and
the built React app on every other path. One process, one port, one origin — so
there is no CORS to configure and only one thing to pay for.

---

## What it costs

You need two things: somewhere to run the container, and a database.

### Database

**PostgreSQL** runs in Docker Compose locally (`postgres:16-alpine`). For
production you can use any managed Postgres (Neon, Supabase, RDS, etc.) and set
`DATABASE_URL`:

```
postgresql://USER:PASSWORD@host:5432/rice_inventory
```

### Hosting — cheapest first

| Host | Cost | Sleeps when idle? | Notes |
|---|---|---|---|
| **Fly.io** | ~$0–2/mo | No (with autostop: yes) | Best value. `shared-cpu-1x` 256MB is enough. Scale-to-zero means you pay for seconds used. |
| **Render** | $0 | **Yes — 50s cold start** | Genuinely free, but the first visit after 15 idle minutes takes ~50 seconds. Fine for personal use, painful for staff. $7/mo removes it. |
| **Railway** | ~$5/mo | No | $5 credit covers a small app. Simplest dashboard of the three. |
| **Hetzner / Contabo VPS** | €4–5/mo | No | Cheapest if you want several apps on one box, but you maintain the server yourself. |

**Recommendation:** Fly.io if you want it always-fast and nearly free; Render if
you want zero cost and can live with the cold start.

---

## Deploying

### Fly.io

```bash
# once
curl -L https://fly.io/install.sh | sh
fly auth login

# from the repo root
fly launch --no-deploy          # detects the Dockerfile; say no to a Postgres db
fly secrets set DATABASE_URL="postgresql://..." \
                JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
fly deploy
```

In `fly.toml`, set `internal_port = 5000` and add this so it costs nearly nothing
while idle:

```toml
[http_service]
  internal_port = 5000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
```

### Render

New → **Web Service** → connect the repo → Runtime **Docker**. Render reads the
`Dockerfile` at the repo root. Add the environment variables below. Health check
path: `/api/health`.

### Railway

New Project → Deploy from GitHub. Railway detects the Dockerfile. Add the
environment variables, then Settings → Networking → Generate Domain.

### Any VPS

```bash
git clone <your-repo> && cd rice-inventory-management
echo "JWT_SECRET=$(openssl rand -hex 48)" > .env
docker compose up -d --build
```

That brings up PostgreSQL alongside the app. Put Caddy or nginx in front for HTTPS.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string. |
| `JWT_SECRET` | **yes** | Signs login tokens. The server refuses to boot in production without it. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | set to `production` | Already set inside the image. |
| `PORT` | no | Defaults to 5000. Most hosts inject their own — the server reads it. |
| `JWT_EXPIRES_IN` | no | Defaults to `30d`. |
| `CORS_ORIGINS` | no | **Leave empty.** Only needed if you host the frontend on a different domain than the API. |

Never commit `JWT_SECRET`. Changing it signs everyone out, which is exactly what
you want if it ever leaks.

---

## First run

The database starts empty. Create the admin account from the command line:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-strong-password' npm run seed
```

Sign in with those credentials. On first login you will be asked to set a new
password. After that, open **Users** to approve anyone who signed up through the
registration form — they cannot use the app until you do.

---

## Verifying a deploy

```bash
curl https://your-app.fly.dev/api/health
# {"status":"OK","database":"connected","uptime":12,...}
```

`"database":"disconnected"` with a 503 means the app is up but cannot reach
Postgres — almost always a mistyped password or the app cannot reach the database host.

---

## Running it locally

```bash
# terminal 1
cd backend && cp .env.example .env   # fill in JWT_SECRET
npm install && npm run dev

# terminal 2
cd frontend && npm install && npm start
```

The frontend dev server proxies `/api` to port 5000, so it behaves exactly like
production without any extra configuration.

To test the real production image locally:

```bash
docker build -t rice-inventory .
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="$(openssl rand -hex 48)" \
  rice-inventory
```
