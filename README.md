# Rice Inventory Management System (RIMS)

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

Inventory, sales and cash for a rice mill, in one place. Replaces the paper
ledger with stock levels that update as you sell, a cash book that balances
itself, and receipts you can hand to a customer.

---

## Quick start

```bash
# Everything (app + database) in one command
echo "JWT_SECRET=$(openssl rand -hex 48)" > .env
docker compose up --build
```

Open <http://localhost:5000>. Bootstrap the first administrator inside the running container (replace these values):

```bash
docker compose exec -e SEED_ADMIN_NAME="Your Name" -e SEED_BUSINESS_NAME="Your Rice Mill" -e SEED_ADMIN_EMAIL="your-email" -e SEED_ADMIN_PASSWORD="unique-temporary-password" app npm run seed
```

The first administrator must change that password at sign-in. Seeding again preserves existing accounts unless `SEED_RESET_EXISTING=true` is explicitly set.

**Sign-ups through the UI are always pending** until an admin approves them in
*Users*. There is no self-service admin — the first admin comes from `npm run seed`.

For hosting it somewhere real — and what that costs — see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Architecture

One Docker image runs both halves: Express serves the API under `/api` and the
compiled React app on every other path. Same process, same port, same origin —
so there is no CORS to configure and only one service to pay for.

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| Frontend | React 18 + Tailwind | Route-level code splitting; charts and the PDF library load only when opened. |
| Backend | Node 22 + Express | Helmet, compression, rate limiting, centralised error handling. |
| Database | PostgreSQL 16 | SQL queries and aggregations; runs in Docker alongside the app. |
| Auth | JWT + bcrypt | Rate-limited login, no user enumeration, graceful session expiry. |
| PDFs | jsPDF | Generated in the browser, so the server does no rendering work. |

---

## Features

### Barcode labels and scan stations

Generate a unique Code 128 label for each rice bag, receive by scanning, and scan bags out at the selling shop. Includes camera/photo reading, printer previews, batch reprints, duplicate-scan protection, retry recovery, and administrator reversals. The home screen has large, easy-to-read stock actions. See **[setup and workflow](docs/BARCODES.md)** for scanner/printer configuration and shared-shop inventory behavior.

The operating app starts in English. Use the globe in the header, sign-in page, or Settings to choose Urdu. The choice persists on that device and switches navigation, forms, messages and layout direction without clearing entered values. Product names and saved business data stay unchanged. Urdu uses a bundled font; barcode numbers remain left-to-right.

### Dashboard
Equal stock valuation and cash balance, quick sale/delivery and money-in/out entry, recent movements, stock health and sales history. Every figure comes from the active business.

### Products
Search, filter and sort; live margin calculation while you type a price; SKUs
generated automatically when you leave the field blank. Deleting archives the
product so past transactions still add up.

### Transactions
Stock in, stock out and adjustments, each showing the resulting stock level
*before* you commit. Stock changes are applied atomically, so two people selling
at once cannot oversell. Reversals restore the recorded stock change and remove
the linked cash entry. Older movements protected by a later absolute adjustment
must be reversed in order, starting with that adjustment.

### Cash Book
Money in and money out in one ledger with a running balance.

- **Sales post themselves.** A paid stock-out with a price creates a matching
  money-in line, so the cash book reflects real takings without re-typing.
- **Manual entries** for owner injections, loans, expenses, salaries and the rest.
- Auto-posted lines are read-only — the transaction stays the single source of
  truth, so the two records can never drift apart.
- Every entry is attributed and timestamped, and entries can be back-dated to
  the day they actually happened.

### Customer credit

Track each customer's existing debt, new credit sales, deposits, due dates, and
partial repayments. Only received money enters the cash book. Includes barcode
credit sales, overdue filters, PDF statements, copied reminders, and recorded
reversals. See [the credit workflow](docs/CREDIT.md).

### Reports
Stock valued at cost and at retail, movement per product, realised profit and
margin over any date range. Exports to PDF.

### Receipts
Near-monochrome, typographically driven documents — a hairline accent, a single
emphasised total, real column alignment. They read as stationery rather than as
a screenshot of a dashboard.

### Settings
Business name, logo, contact details, currency symbol, brand colour and light/dark
theme. Brand colour is used for meaningful accents at runtime; navigation and primary controls stay neutral.

### User management (admin)
Approve or decline sign-up requests, assign roles (worker, accountant, admin),
suspend accounts and reset passwords.

---

## Local development

```bash
# terminal 1 — API
cd backend
cp .env.example .env        # fill in JWT_SECRET
npm install && npm run dev

# terminal 2 — UI
cd frontend
npm install && npm start
```

The dev server proxies `/api` to port 5000, so it behaves exactly like
production with no extra configuration.

### Useful scripts

| Command | Location | Purpose |
| :--- | :--- | :--- |
| `npm run seed` | `backend/` | Create the first admin account from the command line. |
| `npm run build` | `frontend/` | Production build. |

## Verification and mobile design

See [DEPLOYMENT.md](DEPLOYMENT.md) for Render setup, backups, test database requirements and the physical iPhone checklist. Floating labels are shared by sign-in, search, product, transaction, cash and settings fields; they respond to focus, value and autofill, with reduced-motion support.
