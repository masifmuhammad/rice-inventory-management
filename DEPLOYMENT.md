# Production hosting

The current production setup uses **Oracle for the app and primary PostgreSQL
database**, with **Neon for backups**. The Oracle Docker image includes the latest
React frontend, so the whole app is available at
<https://193.123.81.103.nip.io>. The existing Vercel frontend at
<https://rice-inventory-management-rh2d.vercel.app> forwards `/api/*` to Oracle
using `frontend/vercel.json`; its Vercel project root must be `frontend`.
Leave `REACT_APP_API_URL` unset for that proxy setup.

| Component | Purpose |
| --- | --- |
| Oracle `193.123.81.103` | Express backend and primary PostgreSQL 18 database; also serves React |
| Vercel | Existing alternate frontend; API requests proxy to Oracle |
| Neon `neondb` | Original Render-era data in `public`, plus rolling Oracle dump backups in `oracle_backups.snapshots` |
| Render | Historical deployment retained; not the active backend |

The November 3 recovery preserves the newer Neon business as the default and
imports the two older Oracle businesses separately. The newest account/password
is retained; the older account has the same email, so its business memberships
and historical user references map to that account. Original Oracle and Neon
backups remain available independently. Stock and cash are never combined across
businesses.

## Oracle operations

Production files live in `/home/ubuntu/rice-live/`: `compose.yml`, `.env`,
`.env.backup`, `backup.sh`, and `backups/`. Configuration is in
`deploy/oracle/compose.yml`. PostgreSQL uses the dedicated `rice-live-postgres18`
Docker volume. Its port is not published. Caddy retains its existing certificates
and proxies to the `rice-live:5000` network alias. The app's local health endpoint
is `http://127.0.0.1:5056/api/health`.

`/api/health` must return JSON with `status: OK`, `database: connected`, and the
release commit in `revision`. A frontend page returned from `/api/health` means
API routing is broken, even if the HTTP status is 200.

The backend does **not** update just because Vercel redeploys. For a release,
build the repository's Dockerfile, label the image with
`org.opencontainers.image.revision=<commit>`, transfer/load it on Oracle, update
`APP_IMAGE` and `APP_REVISION` in the private production `.env`, and run
`docker compose --env-file .env -f compose.yml up -d backend`. Take a backup first;
check the health revision, sign-in, and stock/cash reads afterward. Never rebuild
the frontend on the 1 GB Oracle instance; build it locally or in CI.

`deploy/oracle/release.sh` automates the Oracle portion: upload the release archive
and its `.sha256` file into `/home/ubuntu/rice-live/`, then run
`bash release.sh <full-commit> <archive-path>` there. It checks the image revision,
saves a verified Neon backup, restarts only the backend, and restores the previous
application if health checks fail. It never restores or replaces the database.

## Backups and rollback

Run `bash /home/ubuntu/rice-live/backup.sh` to save a complete PostgreSQL custom
dump on Oracle and upload it to Neon. The uploader downloads the stored bytes and
checks SHA-256 before reporting success. The latest seven uploaded snapshots are
kept in `oracle_backups.snapshots`; the original `public` schema is untouched.
A daily cron entry runs the same script under a lock and writes `backup.log`.
Check that log and the most recent snapshot timestamp regularly.

For recovery, download a snapshot's `archive` bytea to a file, verify its recorded
SHA-256, and restore with PostgreSQL 18 `pg_restore` into a **new empty database**.
Validate record counts, stock and cash before switching `PRIMARY_DATABASE_URL`.
Never restore over the only working database. Retain the prior image and database
until the replacement is verified. The pre-recovery Oracle containers/volume are
retained for rollback; do not run `docker compose down -v` or prune volumes.

This setup adds no paid resources. Actual free-tier eligibility, account billing
and usage limits remain controlled by Oracle, Neon and Vercel. Scheduled Render
keep-awake pings are disabled so they do not consume idle compute allowances.

## Historical Render setup

The production layout is one Docker web service on Render's free plan serving both React and Express, with a free PostgreSQL database on [Neon](https://neon.tech). Render's own free PostgreSQL is deleted after 30 days, so it is not used. The free web service sleeps after 15 minutes idle; the first visit after that takes about a minute. The frontend calls /api on the same HTTPS origin. There is no separate frontend host or CORS setup to maintain.

Redis is not required for this single-instance deployment. PostgreSQL remains the
source of truth for stock, cash and accounts. Add a shared rate-limit store before
scaling to multiple app instances; consider Redis-compatible storage when shared
caches or background job queues become necessary. The current in-memory rate
limits reset on restart. See the [rate-limit guidance](https://express-rate-limit.mintlify.app/overview)
and [Render Key Value documentation](https://render.com/docs/key-value).

## Deploy after pushing the reviewed changes

1. Create a free project on Neon (region: Singapore / ap-southeast-1) and copy its connection string. It ends in `?sslmode=require`.
2. In Render, choose **New > Blueprint** and connect **masifmuhammad/rice-inventory-management**. It creates one free web service in Singapore.
3. Paste the Neon string when Render asks for DATABASE_URL. Render generates JWT_SECRET. Leave PORT to Render. Keep REACT_APP_API_URL and CORS_ORIGINS unset for this combined deployment.
4. Wait for the initial Docker build and the /api/health check to succeed. Startup applies the schema before accepting requests. Overlapping migrations share a PostgreSQL advisory lock.
5. Bootstrap your admin as described below, then sign in through the HTTPS service URL.

Blueprint fields follow [Render's specification](https://render.com/docs/blueprint-spec). Auto-deploys use checksPass, so subsequent GitHub changes deploy only after the Production checks workflow passes. The Blueprint is prepared locally; creating it in Render is a separate deployment step.

## First administrator

Render's free plan has no Shell, so seed from your own machine against the Neon database once the first deploy has created the schema. In `backend/`, with dependencies installed, set these for one run:

- DATABASE_URL: the Neon connection string
- SEED_ADMIN_NAME: your name
- SEED_ADMIN_EMAIL: your actual sign-in email
- SEED_ADMIN_PASSWORD: a unique temporary password
- SEED_BUSINESS_NAME: your business name

Then run **npm run seed**. The first account is an active administrator and must change its password on first sign-in. New registrations require admin approval.

Do not save SEED_ADMIN_PASSWORD anywhere after setup. Running the seed again leaves existing accounts untouched. SEED_RESET_EXISTING=true is an explicit recovery operation: it resets credentials, activates admin permissions, and requires another password change. Never run npm run reset in production.

## Production behavior

- Render terminates HTTPS; Express trusts one proxy hop and honors the assigned PORT.
- API responses and the service worker are not cached by shared proxies. Hashed frontend assets are immutable; HTML, manifest, icons and service-worker files revalidate.
- /api/health probes PostgreSQL and returns 503 when it cannot respond. API and database timeouts are bounded.
- Stock movements, corrections, reversals and sale cash entries commit together. Product row locks serialize competing changes.
- Report calendar dates use REPORT_TIMEZONE (Asia/Karachi). TZ also sets the process's local timezone.
- The database denies public connections in the Blueprint. Images and business logos are stored in PostgreSQL; no persistent web-service disk is needed.
- Rate limits use process memory. The Blueprint is a single instance; shared rate-limit storage is needed before running multiple instances.

## Verify after deployment

Open /api/health and confirm status OK and database connected. Then check sign-in and first password change, product creation, a stock-in, a sale, its matching cash-book line, a reversal, reports, business switching, and a receipt download/share. Refresh /products directly to check SPA routing.

On an actual iPhone, open the HTTPS URL in Safari, then **Share > Add to Home Screen**. Check portrait and landscape, numeric keyboards, the last field in each form, Previous/Next/Done, date/category pickers, the home indicator, and light/dark mode. Browser automation tests layout and the WebKit engine; real iOS keyboard animation and the system share sheet still need a physical-device pass.

The PWA shows its shell offline and a connection notice. It does not queue stock or cash writes offline; reconnect before recording entries. Updates prompt before reloading an open form.

## Existing production data and recovery

The Blueprint creates a new empty database. Existing business records are **not** imported automatically. Before replacing a deployed system, export its PostgreSQL database and restore it into the target database, then validate record counts, stock balances and cash totals before directing staff to it. Keep the original deployment available during that verification.

Take a backup before deploying schema changes. Use Render's database backup/recovery controls and confirm the retention available on the selected plan. Redeploying the previous Docker image rolls back application code; restoring a database backup is a separate operation. The schema additions in this change preserve existing columns and records.

## Local verification

Use Node 22+ and PostgreSQL 16. Install locked dependencies with npm ci in backend and frontend. Build the frontend with npm run build; Docker also sets INLINE_RUNTIME_CHUNK=false and GENERATE_SOURCEMAP=false.

Backend checks: set TEST_DATABASE_URL to a **dedicated test database** whose name contains test or readiness, then run npm test in backend. The integration suite refuses to fall back to DATABASE_URL and cleans up only its own fixture businesses.

Browser checks: in frontend, run npx playwright install chromium webkit, then npm run test:e2e with the same TEST_DATABASE_URL. The fixture server uses port 5055. Never point these fixtures at real business data. CI runs the database checks, production frontend build, browser checks, runtime dependency audits and Docker build.

The legacy Create React App build tooling still has development-only audit findings. It is confined to the build stage and is absent from the production image. Both runtime dependency trees are audited separately. Replacing that build system should be a separate, verified migration.

## Historical profit figures

New stock movements retain the product cost at recording time, so later price edits do not change their historical margin. Legacy movements without a cost snapshot retain the previous fallback to current product cost; their original costs cannot be reconstructed automatically. Review imported historical margins with your accountant.
