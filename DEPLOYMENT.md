# Deploy to Render

The production layout is one Docker web service serving both React and Express, with a managed PostgreSQL database. The frontend calls /api on the same HTTPS origin. There is no separate frontend host or CORS setup to maintain.

Redis is not required for this single-instance deployment. PostgreSQL remains the
source of truth for stock, cash and accounts. Add a shared rate-limit store before
scaling to multiple app instances; consider Redis-compatible storage when shared
caches or background job queues become necessary. The current in-memory rate
limits reset on restart. See the [rate-limit guidance](https://express-rate-limit.mintlify.app/overview)
and [Render Key Value documentation](https://render.com/docs/key-value).

## Deploy after pushing the reviewed changes

1. In Render, choose **New > Blueprint** and connect **masifmuhammad/rice-inventory-management**. Use the branch containing render.yaml.
2. Review the two paid resources before creating them: the web service and PostgreSQL, both in Singapore. The Blueprint uses the smallest paid compute sizes; check Render's displayed prices before deployment.
3. Render generates JWT_SECRET and connects DATABASE_URL to the database's private connection string. Leave PORT to Render. Keep REACT_APP_API_URL and CORS_ORIGINS unset for this combined deployment.
4. Wait for the initial Docker build and the /api/health check to succeed. Startup applies the schema before accepting requests. Overlapping migrations share a PostgreSQL advisory lock.
5. Bootstrap your admin as described below, then sign in through the HTTPS service URL.

Blueprint fields follow [Render's specification](https://render.com/docs/blueprint-spec). Auto-deploys use checksPass, so subsequent GitHub changes deploy only after the Production checks workflow passes. The Blueprint is prepared locally; creating it in Render is a separate deployment step.

## First administrator

Temporarily add these environment variables to the **web service** in the Render dashboard:

- SEED_ADMIN_NAME: your name
- SEED_ADMIN_EMAIL: your actual sign-in email
- SEED_ADMIN_PASSWORD: a unique temporary password
- SEED_BUSINESS_NAME: your business name

After saving the environment, open the service's **Shell** and run **npm run seed** from /app. The first account is an active administrator and must change its password on first sign-in. New registrations require admin approval.

Remove SEED_ADMIN_PASSWORD after successful setup. Running the seed again leaves existing accounts untouched. SEED_RESET_EXISTING=true is an explicit recovery operation: it resets credentials, activates admin permissions, and requires another password change. Never run npm run reset in production.

## Optional AI assistant

Add OPENROUTER_API_KEY only if you want chat, voice and scanning. It stays on the server. Set OPENROUTER_SITE_URL to the public HTTPS app URL. Without a key, inventory and ledger features still work and the assistant stays hidden. Live AI calls require provider credentials and available models/credits; they are not part of offline tests.

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
