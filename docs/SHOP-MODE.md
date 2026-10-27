# Shop mode

Use the shopping-bag button in the header to switch between the dashboard and Shop mode. The selected mode is remembered for each user and business.

## Product buttons

An administrator uses **Set up buttons** to choose the packet size, supplier, colour and short product name. Selling and cost prices come from the product record.

- **Sell:** tap a product, then **Record cash sale**. Use the quantity controls for more packets. Stock and cash are recorded together.
- **Receive:** choose a quantity (including the **50** shortcut), tap a product, then **Receive packets**. This records stock and an unpaid supplier bill. An administrator records the supplier payment separately.

## Attached scanner

Select **Use scanner** once. This choice is remembered for the current browser session. Connect a USB or Bluetooth scanner in keyboard/HID mode with Enter or Tab after each code. The scanner must read this app's unique packet labels: 18 digits starting with 99. Ordinary retail product codes are not mapped to these labels.

- **Sell:** each scan immediately records that labelled packet's cash sale at the product's selling price. There is no separate save step.
- **Receive:** each prepared label adds that bag to stock once. This existing label workflow does not create a supplier bill or payment; use the product-button receipt flow when a supplier bill is needed.
- Check the green confirmation from the app. A beep from the scanner itself is not a server confirmation.
- Repeated labels cannot sell or receive the same packet twice. Released, expired, unknown and wrong-business labels are rejected.
- Use **Pause** to stop scanning. Other forms and dialogs do not accept background scans.
- If the connection interrupts a save, **Recover pending scans** confirms the same requests, including after a page reload. The mode controls stay locked until pending scans are resolved.

Save or clear the current product selection before switching to scanning. Each workflow has its own confirmation; do not enter a scanned sale again with a product button or Money in.

## Mobile presentation

The header uses a flexible business-name area and matching circular controls with accessible names and 44-pixel touch targets. Phone dashboard actions keep descriptions available to assistive technology while showing short labels visually. Scanner instructions are available under **Scanner setup**, and the latest confirmation appears above the code field.

Browser checks use desktop Chrome and WebKit at iPhone sizes. Physical scanner hardware and the native iOS keyboard are not simulated by those checks.
