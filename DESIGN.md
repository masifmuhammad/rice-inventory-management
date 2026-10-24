---
name: Rice inventory application
description: A clear, balanced ledger for rice stock and cash.
colors:
  primary-50: "rgb(236 253 245)"
  primary-100: "rgb(209 250 229)"
  primary-200: "rgb(167 243 208)"
  primary-300: "rgb(110 231 183)"
  primary-400: "rgb(52 211 153)"
  primary-500: "rgb(16 185 129)"
  primary-600: "rgb(5 150 105)"
  primary-700: "rgb(4 120 87)"
  primary-800: "rgb(6 95 70)"
  primary-900: "rgb(6 78 59)"
  surface-base: "rgb(247 248 247)"
  surface-1: "rgb(255 255 255)"
  surface-2: "rgb(249 249 249)"
  surface-3: "rgb(244 244 244)"
  surface-sunken: "rgb(239 239 239)"
  content: "rgb(20 20 20)"
  content-muted: "rgb(111 111 111)"
  content-subtle: "rgb(112 112 112)"
  dark-surface-base: "rgb(17 17 17)"
  dark-surface-1: "rgb(28 28 28)"
  dark-surface-2: "rgb(34 34 34)"
  dark-surface-3: "rgb(42 42 42)"
  dark-surface-sunken: "rgb(10 10 10)"
  dark-content: "rgb(250 250 250)"
  dark-content-muted: "rgb(138 138 138)"
  dark-content-subtle: "rgb(155 155 155)"
  inventory-stock-fill: "#e0edf3"
  inventory-stock-ink: "#264c60"
  inventory-lookup-ink: "#31586c"
  inventory-in-fill: "#dceee3"
  inventory-in-ink: "#215c40"
  inventory-out-fill: "#e9e5fa"
  inventory-out-ink: "#453678"
  dark-inventory-stock-fill: "#223640"
  dark-inventory-stock-ink: "#c1e0ed"
  dark-inventory-in-fill: "#203b2c"
  dark-inventory-in-ink: "#b9e3c8"
  dark-inventory-out-fill: "#302b43"
  dark-inventory-out-ink: "#d8cff5"
typography:
  figure:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.25rem, 5.4vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  heading:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  subhead:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.014em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.55
    letterSpacing: "-0.011em"
  caption:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  field:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
  urdu:
    fontFamily: "Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0"
  mobile-body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  mobile-control:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    lineHeight: 1.4
  mobile-support:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  mobile-navigation:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    lineHeight: 1.4
rounded:
  card: "16px"
  well: "12px"
  pill: "12px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  3.5: "14px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
components:
  button-primary:
    backgroundColor: "{colors.content}"
    textColor: "{colors.surface-1}"
    rounded: "{rounded.well}"
    padding: "10px 16px"
  button-primary-dark:
    backgroundColor: "{colors.dark-content}"
    textColor: "{colors.dark-surface-1}"
    rounded: "{rounded.well}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.content}"
    rounded: "{rounded.well}"
    padding: "10px 16px"
  button-ghost:
    textColor: "{colors.content-muted}"
    rounded: "{rounded.well}"
    padding: "10px 16px"
  field-floating:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.content}"
    typography: "{typography.field}"
    rounded: "{rounded.well}"
    padding: "23px 14px 7px"
  field-floating-dark:
    backgroundColor: "{colors.dark-surface-base}"
    textColor: "{colors.dark-content}"
    rounded: "{rounded.well}"
    padding: "23px 14px 7px"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.content}"
    rounded: "{rounded.card}"
  badge-neutral:
    textColor: "{colors.content-muted}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  inventory-action-stock:
    backgroundColor: "{colors.inventory-stock-fill}"
    textColor: "{colors.inventory-stock-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
  inventory-action-in:
    backgroundColor: "{colors.inventory-in-fill}"
    textColor: "{colors.inventory-in-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
  inventory-action-out:
    backgroundColor: "{colors.inventory-out-fill}"
    textColor: "{colors.inventory-out-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
  inventory-action-stock-dark:
    backgroundColor: "{colors.dark-inventory-stock-fill}"
    textColor: "{colors.dark-inventory-stock-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
  inventory-action-in-dark:
    backgroundColor: "{colors.dark-inventory-in-fill}"
    textColor: "{colors.dark-inventory-in-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
  inventory-action-out-dark:
    backgroundColor: "{colors.dark-inventory-out-fill}"
    textColor: "{colors.dark-inventory-out-ink}"
    rounded: "{rounded.card}"
    padding: "23px"
---

# Design System: Rice inventory application

## Overview

**Creative North Star: "Trading house ledger"**

A calm operating workspace for a rice business: quantities and money carry the hierarchy, and familiar controls support repeated entry. Stock and cash receive equal visual priority. The finish follows native iPhone conventions while retaining the real mill logo and the active business's editable identity.

Opaque neutral surfaces, restrained dividers and compact rows keep records legible in light and dark themes. Colour identifies focus, meaningful status and data series. Financial figures use a distinct self-hosted face; interface copy follows the device. There is no decorative gradient or invented business performance.

**Key Characteristics:**

- Balanced stock and cash hierarchy.
- Device-native interface type with distinct money figures.
- Quiet tonal surfaces in both themes.
- Persistent floating labels and keyboard-safe entry.
- Actual mill and active-business branding.

## Colors

The palette is neutral-led, with an editable emerald brand ramp and semantic status colour.

### Primary

The `primary-*` tokens are the default emerald ramp. Settings may replace this ramp at runtime for a business. Use the live CSS custom properties for focus, selection and brand states. Primary action buttons use the content/surface inversion rather than a fixed brand fill.

Meaningful positive stock status and the sales line use emerald; warnings use amber; destructive actions and errors use red. The sales line uses the darker emerald step in light mode and a lighter step in dark mode. Status labels remain present beside colour.

### Inventory operation accents

Pastel blue identifies viewing stock or reading a label, green identifies receiving, and lavender identifies selling. These paired fill/ink roles repeat on inventory action cards and selected scanner modes, with distinct dark-theme pairs. Label lookup uses its recorded stronger blue ink in light mode. Keep the operation's name in the selected language and package, inward-arrow, outward-arrow or search icon beside the colour; selected scanner modes also have an inset outline. These are operation identities, while transaction badges retain their existing semantic status colours. They do not replace runtime brand colours or the content-inversion primary button.

### Neutral

`surface-base` is the canvas; `surface-1` holds cards and dialogs; `surface-2` and `surface-3` distinguish nested panels, tracks and hover states. `surface-sunken` is the recessed role. Their `dark-*` counterparts are the actual `.dark` overrides, not a separate composition. `content`, `content-muted` and `content-subtle` separate records, supporting text and hints.

**The Theme Pair Rule.** Every new surface uses semantic surface/content roles and receives a light and dark check; runtime branding must continue to work through CSS variables.

## Typography

Interface text and headings use System UI with platform fallbacks. Money uses Manrope, self-hosted through the bundled 600 and 700 font files. Figures use tabular lining numerals; ordinary quantities may retain the interface family. Urdu uses self-hosted Noto Sans Arabic (400 and 600), loaded only when selected, with generous leading and normal letter spacing.

The frontmatter records the configured type roles and shared figure treatment. Figure size also has a smaller responsive variant. Cash-entry figures and headline totals use context-specific sizing; do not force every monetary value to headline size. The `body` role is a named text utility, while the base body has normal tracking. Coarse-pointer styles enlarge small text and restore normal body tracking; actual text inputs remain at least (16px) on phones.

Below (640px), the mobile body, control, support and navigation roles override the desktop utilities. Floating labels have a (14px) base and pin at (0.875) scale. The compact language trigger also uses (12px) text within a (44px) target; ordinary language menu options use (16px) text and (48px) rows. These overrides follow generated utilities so support copy remains readable.

English is the default. A persistent English/Urdu picker is available in the header, sign-in page and Settings; the choice is saved locally. Urdu changes operating screens to right-to-left; product names, stored data and barcode identifiers remain unchanged. Barcode, numeric, email, password and date inputs remain left-to-right. Money retains Manrope. Urdu floating fields grow to (64px) minimum height, with normal tracking and generous leading. The independently branded public landing page retains its own language composition.

**The Selected Language Rule.** Show interface copy in the selected language; do not stack English and Urdu translations on the same operating control.

**The Numeric Clarity Rule.** Keep amounts tabular, include their currency or unit, and preserve the distinction between money and ordinary interface copy.

## Layout

Use the existing compact spacing scale rather than creating a new rhythm. Main content has horizontal padding (16px) on phones, (24px) from `sm`, and (28px) from `lg`; recurring card content uses (16px), growing to (24px). Rows and controls remain comfortable touch targets (44px minimum for actions). The shared button's small variant contracts to (36px) from `sm`; coarse-pointer segmented controls retain (44px).

The additional `xs` breakpoint is (400px). Existing Tailwind boundaries are `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px) and `2xl` (1536px). Below `lg`, use the bottom Home, Stock, Sales and Cash tabs with capability filtering, plus the navigation drawer. The current tab bar is a full-width opaque dock with a safe-area inset and (64px) item height. From `lg`, the labelled sidebar is (248px) wide and inset (16px); its navigation scrolls while brand and footer remain available.

The sticky header is (60px) on phones and (64px) from `sm`, excluding safe-area and desktop top inset. Product search appears from `lg`; tablet header space belongs to identity and controls. Scrolled page summaries preserve key figures, with paired stock/cash text allowed two lines on narrow screens. Keep the active business explicit when its switcher is shown.

Tables scroll inside their own horizontal pane. Sheets, pickers and the document must not acquire horizontal overflow. Reserve safe-area and navigation clearance at the bottom; the optional assistant adds bottom clearance below `lg` and a right gutter from `sm` so it cannot cover form actions.

The barcode extension adds a Scan tab between Stock and Sales. Inventory actions retain three equal columns on phones, with single-language titles and outcome descriptions. Form grids allow children and fieldsets to shrink within their column; long rice names and option descriptions must not widen the document.

## Elevation & Depth

The canvas and cards establish depth through opaque tonal steps. Cards have a quiet hairline (8% alpha) and no resting shadow; a dark interactive card changes tone on hover. Headers and bottom tabs are opaque and unblurred. High-contrast preference strengthens edges.

Floating dialogs, drawers, toasts and selected segmented indicators have selective elevation. The exact shadow values and motion curves live in the sidecar. Phone modal scrims use a black wash; fine-pointer scrims may add a small backdrop blur. Keep these overlay behaviours distinct from flat document surfaces.

**The Quiet Surface Rule.** Give ordinary content cards tone and a subtle edge; reserve strong depth for overlays that actually sit above content.

## Shapes

Shared cards and dialogs use gently rounded corners (`card`). Fields, wells and default buttons use the smaller radius (`well`). Despite its name, the configured `pill` token is also the smaller corner radius; truly capsule-shaped controls use `full`. Preserve this distinction when adding controls. Badges and segmented tracks are capsules; drawer and desktop navigation selections use card-sized corners. Phone pickers have their own larger top corners (28px).

## Components

### Buttons

Confident, compact controls. The default primary inverts the live content and surface colours; secondary uses a fine border and surface fill; ghost uses muted text. Danger and success variants use their semantic colour. Default padding is (10px 16px), with (44px) minimum height; large actions use (12px 24px) and (48px) minimum height. Loading replaces the leading icon and disables the button. Hover, visible brand focus ring, pressed scale and disabled opacity communicate state. Reduced motion removes the press transform.

### Inputs / Fields

The floating shell is (60px) minimum height with an inset label. The label floats on focus and actual value, remains associated with the input, and returns when an empty field blurs. Date/time-style controls pin the label. Values remain (16px); errors and hints sit below the shell and are connected through accessible descriptions. Focus uses a brand border and soft ring; invalid focus uses red. Dark fields recess into the canvas role. Do not substitute placeholders for labels.

Phone selects open a bottom picker sheet; wider screens use an anchored list. Options retain named labels, selected marks and touch-sized rows. Keyboard Enter advances through editable fields while respecting composition and explicit handlers.

### Cards / Containers

Use the shared card primitive, its semantic fill, hairline and card radius. Card headers use space for grouping rather than a heavy divider; bodies use the shared responsive padding. Nested panels use a quieter tonal role. Interactive cards may change tone in dark mode without acquiring a new decorative shadow.

### Chips

Badges are compact capsule labels with an inset ring and restrained semantic tint. Neutral, primary, success, warning and danger states carry meaning through text as well as colour. They are status labels rather than substitutes for full-size action targets.

### Navigation

Desktop navigation sits directly on the canvas, with a raised selected thumb, leading outline icon and readable label. Phone tabs distinguish selection through text weight and icon stroke without decorative backgrounds. Preserve route and permission behaviour. The real logo and active business name take precedence over generic marks; an uploaded logo falls back to the bundled mill asset before the final unavailable-image icon.

### Dialogs and keyboard controls

Dialogs become bottom sheets on phones and centred panels from `sm`. Constrain them to the visual viewport, scroll the body, and keep the focused field visible as the keyboard changes size. Only the grabber begins a drag. While typing, compact the chrome and show Previous, Next and Done controls; Done moves focus to a non-text control inside the dialog so the focus trap does not reopen the keyboard. All keyboard controls retain (44px) targets. Hide phone tabs and assistant chrome while the soft keyboard is open.

Transitions should explain state, not decorate idle content. Use the shared non-bouncing UI springs and short opacity/transform transitions; gesture release may retain momentum. Honour reduced-motion preferences and preserve immediate navigation.

When the last field exposes the form's submit action, keep Previous available while the keyboard is open so the user can revisit earlier entries.

### Inventory actions and scanner feedback

Large, single-language action cards use the inventory operation pairs, a direction or package icon, a title in the selected language and a short outcome. Cards use the existing card radius; their minimum height is (176px), or (164px) below (640px), where padding becomes (18px 12px). Mobile titles use (17px) and supporting outcomes use the mobile support role; Urdu titles and outcomes have extra leading (1.7 and 1.8). Keyboard focus uses the live brand outline. Fine-pointer hover lifts a card slightly (2px) and adds a restrained interaction shadow; pressing scales it to (0.985). Reduced motion removes this travel.

Scanner modes pair the same operation colours with readable names, icons and an inset selected outline (2px). Stock-changing modes require an explicit start; label lookup does not change stock. Distinguish ready, pending, blocked and server-confirmed states with text. A scanner beep is not a stock confirmation. Confirmed results reveal once over (240ms); reduced motion shows the result immediately. Keep optional counter/customer details secondary to the scan controls.

Printable labels remain white with dark ink in both themes. Their barcode is the actual Code 128 SVG for the pack code; preserve the human-readable number, quantity/unit and active business identity. Preview/test labels are explicitly distinguished from recorded stock labels.

## Customer credit

This is an Operate surface: customer selection and collection actions carry the
hierarchy. Desktop pairs a compact customer directory with the account history.
On phones, choosing a customer replaces the directory with their account, keeps
the repayment action above the tab bar, and provides an explicit return control.
Names and amounts wrap independently; money uses Manrope and tabular numerals.

Use the existing neutral surfaces and controls. Muted violet identifies credit
entries and the selected account; restrained red and the word Overdue identify
late balances. Payment status always includes text. History retains reversed
entries with a reason and struck-through amount. Empty accounts explain the next
action, forms preserve drafts on failure, and statement/reminder actions stay
secondary to recording a repayment or sale. Support light, dark, English, Urdu,
RTL, keyboard navigation, and reduced motion.

## Do's and Don'ts

### Do:

- **Do** give stock and cash equal hierarchy and preserve currency and unit labels.
- **Do** use semantic tokens in both themes and retain editable business branding.
- **Do** retain real labels, visible keyboard focus and comfortable phone controls.
- **Do** use Manrope for money and System UI for interface text.
- **Do** show one selected language at a time; use local Noto Sans Arabic and RTL in Urdu.
- **Do** keep floating controls clear of content and form actions.
- **Do** derive status and charts from actual records, with clear empty and error states.

### Don't:

- **Don't** replace the mill logo or active business name with invented branding.
- **Don't** add decorative gradients, paper textures or fabricated performance figures.
- **Don't** reserve colour solely for decoration or rely on colour alone for status.
- **Don't** let the soft keyboard conceal the active field or remove the field's label.
- **Don't** apply overlay shadows and blur to every card or header.

<!-- Extraction sources: frontend/src/index.css; frontend/src/MobileTypography.css; frontend/tailwind.config.js; frontend/src/index.js; components/ui/{Field,Button,Card,Badge,Modal,KeyboardToolbar}.js; components/{Layout,AppHeader,MobileTabBar,BrandLogo,BusinessSwitcher,InventoryActions,LanguagePicker}.js; context/LanguageContext.js; i18n/locale.js; utils/motion.js. Surface-specific composition remains in .impeccable/surfaces/app.md and inventory-scanning.md. CSS declarations take precedence over stale source comments. -->

<!-- Public identity scope: the independent 999 landing page (/ for visitors, /welcome always) has its own identity, recorded in PRODUCT.md and implemented in frontend/src/pages/Landing.css. It does not replace this authenticated inventory design or active-business branding. -->
