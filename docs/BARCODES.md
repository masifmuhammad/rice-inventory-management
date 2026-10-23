# Rice bag labels and scanning

The scanner tracks **one physical bag or pack per unique label**. A 25 kg bag deducts 25 kg from a product recorded in kg. A product recorded in bags uses a quantity of 1 per bag. Product prices are per product unit.

## At the mill or receiving shop

1. Open **Make labels** from Home or Stock.
2. Choose the rice, quantity per bag, and number of bags (up to 200 per batch).
3. Choose the correct stock action:
   - **Receive new stock:** creates labels and records stock in immediately.
   - **Print first, receive later:** creates prepared labels; scan each bag using **Stock in** when it arrives.
   - **Label stock already counted:** labels existing, unlabelled stock without increasing it.
4. Print one label first, check it with **Read label**, then print the remaining labels. Attach each unique code to exactly one bag.

Printed labels include the business, rice name, SKU, quantity and unit, barcode, and optional batch and expiry date. Reprints keep their existing code and never change inventory. Use the batch list to recover and reprint previous labels.

## At the selling shop

1. Sign in to the **same business** as the receiving shop.
2. Open **Scan**, choose **Stock out**, optionally name the shop/counter and customer, and press **Start stock out**.
3. Scan a bag. Wait for the green confirmation: rice, quantity, stock remaining and sale value.
4. Continue with the next bag. Scanner input is queued while earlier scans are checked.

Stock out records a sale at the product's current selling price and uses the existing automatic cash-book posting. It represents a paid sale, not a shop transfer, credit sale or write-off. Separate businesses remain isolated. The optional counter name records where work happened; this version maintains one shared inventory per business, not separate balances for each shop.

**Read label** checks status and movement history without changing stock. You can use a connected scanner, type the number, use the camera, or read a barcode photo. This workflow reads this app's generated pack codes, not arbitrary supplier UPC/EAN codes.

## Scanner setup

- Use a USB scanner, or pair a Bluetooth scanner with the operating system.
- Select **keyboard / HID mode**, enable **Code 128**, and match the scanner's keyboard language to the computer.
- Configure **Enter / carriage return** after each barcode. Tab is also accepted in the barcode field.
- Start the stock action and keep focus in the barcode field. The screen indicates when it is ready.
- Scanner beeps mean a code was read; the app's green confirmation means the movement was saved.

Camera scanning needs HTTPS (or localhost), camera permission, and a reasonably sharp view of the entire code. Closing the camera stops its stream. Photo reading runs locally in the browser.

## Printer setup

- Install the printer manufacturer's normal operating-system driver.
- Choose **50 × 30 mm**, **70 × 40 mm**, or **100 × 50 mm** paper in the app and the printer dialog.
- Select **100% / actual size**, **no margins**, and disable browser headers and footers.
- A4 output is a three-column sheet of 70 × 40 mm cut-out labels. It does not promise alignment with any pre-cut sticker sheet.
- Print one label and physically scan it before printing a production batch. Printer darkness, paper feed calibration, resolution, stock and scan distance affect readability.

The app opens a print preview with a Print button. The browser and installed driver control the printer; it does not use silent printing, raw ZPL, or direct USB printer access. These internal Code 128 codes are not GS1 retail product identifiers.

## Mistakes and connection failures

- A second stock-in or stock-out scan of the same bag is rejected without moving stock.
- If confirmation is lost, **Recover pending scans** retries the original request. The server returns the recorded acknowledgement without repeating it. Pending requests survive reloads in the same tab when session storage is available.
- Do not continue scanning offline. The app pauses on uncertain results, expired sessions and rate limits.
- Administrators can reverse the latest bag scan from the session list or Transactions. Reversal updates the label, stock and linked sale cash together. Reverse newer movements of the same bag first. Barcode transactions cannot be edited into different quantities.
- A stocked-out pack cannot simply be scanned in as new stock. An administrator must reverse the appropriate movement first.
- Expired packs cannot be received or sold by scan. Check the pack and have an administrator review it.
- Manual sales and stock corrections cannot consume inventory assigned to labelled bags. Scan those bags; manual movements remain available for loose, unlabelled stock.
- Products with labels retain their original unit, even after sale, so historical pack quantities stay meaningful.
- A product with labelled bags still in stock cannot be archived. Scan those bags out or reverse their receipts first.

## Technical verification and rollout

Schema changes are additive and applied by the app's existing startup migration. No existing product is automatically relabelled or received. Keep the normal database backup before deploying. Old clients can still use the inventory API, but stock allocated to labels must use the barcode workflow to leave inventory.

The database serializes movements using product and label locks. Label status, inventory, transaction and cash changes commit in a single PostgreSQL transaction. Batch and scan request IDs are persisted for retry protection and are scoped to the active business. Barcode API traffic has a separate bounded rate budget for busy counters.

Run backend integration checks only against a dedicated database:

```powershell
$env:TEST_DATABASE_URL='postgresql://user:password@localhost:5432/rice_test'
cd backend
npm test
```

After building the frontend, run `npx playwright test e2e/barcodes.spec.js` from `frontend` with that test database configured. The tests cover label generation, receiving, selling, duplicate scans, rapid input, printed output, photo reading and recovery after a lost acknowledgement.

Physical scanner/printer compatibility and label feed calibration still require testing on the connected hardware.

## Workflow references

- [Odoo: scanner setup](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode/setup/hardware.html) — keyboard layout and carriage-return suffix.
- [Shopify: barcode labels](https://help.shopify.com/en/manual/sell-in-person/hardware/barcode-printer/retail-barcode-labels) — Code 128, label previews, printer and paper configuration.
- [Odoo: serial-number tracking](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/serial_numbers.html) — unique physical-item identification and movement traceability.
