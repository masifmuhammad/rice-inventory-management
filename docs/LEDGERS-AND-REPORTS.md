# Trading ledgers and reports

## Sales register

Open **Reports → Sales register**. Filter by dates, customer name, rice product,
paid-at-sale/credit, or payment status. Today, yesterday, this month and 30-day
presets use the reporting timezone. Screen results are paginated; PDF and CSV
exports include every matching sale, including periods exceeding 1,000 sales.
Detail and totals are read in one database snapshot.

The period selects sale dates. Received/outstanding figures show the current
payment position, including repayments after that period. They are not an
historical receivables valuation. Gross profit is sale value minus the recorded
cost snapshot; it excludes operating expenses. Reversed stock transactions are
excluded from current sales; corrections remain in the audit log.

## Daily closing

Open **Reports → Daily closing** and choose the business day. Opening funds plus
money in minus money out equals closing funds. The report separates sales,
deposits, collections against earlier debt, and money movements by category.
Payment-method rows reconcile separately for cash, bank, Easypaisa, JazzCash,
other, and unclassified entries.

This reports the recorded ledger. It does not lock a cashier session or store a
physical cash count. Bank is a combined payment-method balance rather than a
reconciliation of individual accounts. Historical entries without a recorded
method remain unclassified. Only methods proven by linked customer repayments
are backfilled. New paid sales/deposits use cash; customer repayments, supplier
payments and manual money entries record their chosen method.

## Supplier credit

Open **Supplier ledger** in navigation or Dashboard. Add a supplier and any
existing debt. Opening debt does not add stock or move money.

Use **Receive a purchase** for rice bought from that supplier. Enter rice,
quantity, cost per unit, purchase date, due date, bill reference and any deposit.
Receiving adds stock, records the full bill, allocates the deposit and posts only
the paid amount as money out, in one database transaction. Do not receive the
same rice again through Transactions or Scan. Non-empty bill references cannot
be reused for active purchases from the same supplier.

**Record payment** settles available bills by oldest due date. Partial payments,
methods and references are supported. This records a payment already made; it
does not initiate a bank transfer. Requests are retry-safe and supplier locks
prevent simultaneous payments exceeding debt.

Accounts include open bills, due-date ageing and date-filtered statements with
opening balance, purchases, payments, running balance and closing balance.
Headline outstanding amounts cover all dates. PDF exports use the selected
statement period.

Administrators can reverse mistakes with a reason. Reverse allocated payments
before reversing a bill. Purchase reversal requires sufficient unassigned stock
and no blocking later absolute stock adjustment. Original bills and payment
history remain visible. Auto-posted money and supplier-linked stock movements
are protected from independent editing.

## Customer archive and statements

**Archive customer** removes a customer from the active directory and new-credit
pickers. Select **Archived** to find them and **Restore customer** to reactivate.
Archiving retains debt, receipts, sales, statements and audit history. Existing
collections and corrections remain available. Overview totals include archived
customers' debt. New credit sales, including barcode sales, require an active
customer. Archive/restore is permission-checked and business-scoped.

Customer PDFs include opening, credit, payments, running and closing balances.
Expand **Statement period** to restrict exported dates; account history remains
available. Deposits are excluded from the credit created, so they are not
deducted twice.

## Documents

Use a UTF-8 PostgreSQL database to store Urdu names. PDFs embed local Ledger Sans fonts covering Latin and Urdu/Arabic, derived from
OFL Noto Sans and Noto Sans Arabic. Their licence is in `frontend/public/fonts`.
`scripts/build-ledger-fonts.py` reproduces the merged, renamed fonts with Python
fonttools. Documents retain original names, repeat table headings, align amounts
and identify page footers. Report headings remain English; Urdu data survives.
Numeric table headings, rows and totals share a right edge across all six
document types. After desktop ledger E2E exports, run
`python scripts/check-pdf-column-alignment.py` (PyMuPDF required) to check the
rendered positions, including repeated headings on continuation pages.

## Migration and rollback

Startup migrations add supplier tables, nullable payment methods and customer
archive timestamps without replacing existing stock, cash or customer data.
The schema is rerunnable. Legacy free-text suppliers are not automatically
converted to payable balances: enter verified opening balances explicitly.

Use the normal database backup process before release. To disable these features,
retain the expanded schema and disable their routes/navigation. An older app
whose startup migration reinstates the old cash-source check will reject
`supplier` entries; do not deploy that old schema unchanged. Do not drop history
tables or coerce unknown methods during rollback.

## Competitive evidence and remaining scope

Reviewed on 26 October 2026:

| Source | Documented capability | Delivered here |
|---|---|---|
| [HysabOne](https://hysabone.com/) | Receivable/payable ageing, party statements, daily activity | Supplier ageing/statements, customer statements, sales register and daily closing |
| [Zoho Books](https://www.zoho.com/us/books/help/reports/sales.html) | Sales by customer/item and invoice details | Filterable sales register with complete PDF/CSV exports |
| [ERPNext](https://docs.frappe.io/erpnext/accounting-reports) | Sales/purchase registers and accounting reports | Trading reports and supplier payables; full accounting remains further work |

REA captured HysabOne's public page in a temporary Chromium session:
`ev_b082230788580b3c0d258a39f4100b988f34dec6cba9e7ffa6a8b55adc1889f9`.
This confirms public contents, not authenticated behavior. Cleanup reported
`terminated-owned-process`. Zoho/ERPNext comparisons use official documentation.
No proprietary application code or visual assets were copied.

This release does not claim universal market parity. Further product work:
multi-line invoices/purchase orders, returns/credit notes, double-entry general
ledger/trial balance/balance sheet, named bank accounts/transfers, physical cash
counts/close locks, weighted-average/FIFO lot costing, bag-weight conversions,
mill production/yield, offline synchronization and tax integrations. Each needs
business rules and reconciliation acceptance before it can be sold as complete.
