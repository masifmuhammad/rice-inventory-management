# Customer credit

Open **Customer credit** from the dashboard or navigation. Administrators and
accountants can view accounts, add customers, record credit sales, and collect
repayments. Workers keep their existing cash-sale workflow.

1. **Add customer.** Enter a name and optional phone number. Expand **Already
   owes you money?** to bring an existing debt into the ledger. This opening
   balance does not move inventory or create cash.
2. **New credit sale.** Choose a product, quantity, and price, then a due date.
   **Received now** supports a deposit. Stock leaves immediately, the received
   portion enters the cash book, and the remainder becomes customer debt.
   The normal transaction form also offers **Pay later · credit**.
3. **Barcode sales.** Before starting stock out, select **Pay later · credit**,
   a customer, and a due date. Each scanned bag adds its selling price to that
   account. Record any money received through **Record repayment**.
4. **Record repayment.** Enter only money actually received, its date, method,
   and optional reference. Cash, bank transfer, Easypaisa, JazzCash, and Other
   are recording methods; this does not initiate a transfer or take payment.
   Payments clear the oldest due debt first. Partial repayments are supported.
5. **Follow up.** Overdue means an unpaid due date before today in the business
   reporting timezone. Download a PDF statement or copy a polite reminder to
   send yourself. The application does not send messages automatically.

The overview shows money to collect, overdue debt, and repayments received.
Voided sales, opening balances, and payments remain in account history and do not
reduce outstanding debt.
The statement identifies credit amounts after any deposit. A credit-sale
document shows the original sale, money received at sale, and its due date;
the customer account contains subsequent repayments and the current balance.

## Corrections

Use **Edit customer** for contact details. Administrators can reverse a repayment
or opening balance with a required reason. A repayment reversal restores debt
and removes its linked cash receipt atomically. Reverse repayments allocated to
an opening balance before reversing the opening balance itself.

Credit-sale quantities, prices, and customer assignments cannot be edited in
place. Reverse any repayments applied to the sale, reverse the transaction, then
record the corrected sale. This protects stock, cash, and customer balances from
drifting apart. Cash-book lines from credit repayments are protected from manual
editing and deletion.

Customer operations are business scoped. Repayments serialize per customer and
use a request identifier: retrying a timed-out repayment cannot collect twice,
and simultaneous repayments cannot exceed the debt. Sale/debt/cash changes
commit in one database transaction. Date-only fields preserve calendar dates
across timezones. Existing cash sales and business data are preserved.

## Research behind the workflow

- [Zoho Books: recording full and partial payments](https://www.zoho.com/sa/books/help/invoice/record-payment-for-invoice.html)
  informed separate sale and receipt records, payment dates, and partial payments.
- [Zoho Books: customer statements](https://www.zoho.com/in/books/help/contacts/other-actions.html)
  informed the customer account history and downloadable statement.
- [Zoho Books: current and overdue receivables](https://www.zoho.com/us/books/help/home/)
  informed due-date status and the overdue collection view.
- [WebKit: inline camera playback requirements](https://bugs.webkit.org/show_bug.cgi?id=260345)
  informed explicit inline playback properties. The scanner also waits for an
  actual frame, offers manual playback after autoplay rejection, bounds a
  no-frame wait, and stops capture on close. Synthetic-video and WebKit UI tests
  do not replace a physical iPhone camera check.
