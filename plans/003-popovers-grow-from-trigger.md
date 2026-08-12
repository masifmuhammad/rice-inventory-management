# 003 — Make the two header popovers grow from their trigger

- **Status**: DONE (applied 2026-08-12)
- **Commit**: 6320b4e + uncommitted working-tree changes (see plans/README.md → "Baseline")
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files, ~25 lines each

Two findings are merged into one plan because the fix is the same recipe applied
twice, and splitting them invites the two popovers in the same header from
drifting apart.

## Problem

Both header popovers appear with no motion at all, so nothing connects the panel
to the button that produced it.

```jsx
/* frontend/src/components/NotificationPanel.js:116-127 — current */
{open && (
  <>
    <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      tabIndex={-1}
      className="fixed inset-x-3 top-[calc(var(--app-header-height)+env(safe-area-inset-top)+0.5rem)] z-50 max-h-[min(70vh,28rem)] overflow-hidden rounded-2xl border border-hairline/[0.07] bg-surface-1 shadow-xl flex flex-col
        lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-96 lg:max-h-[28rem]"
    >
```

```jsx
/* frontend/src/components/BusinessSwitcher.js:76-81 — current */
{open && (
  <ul
    role="listbox"
    aria-label="Select business"
    className="absolute left-1/2 -translate-x-1/2 mt-1 w-[min(16rem,90vw)] rounded-xl border border-hairline/[0.07] bg-surface-1 shadow-lg py-1 z-50"
  >
```

The rest of the app already solves this. `frontend/src/components/ui/Modal.js:47-54`
scales its panel in, `frontend/src/components/ui/PillFilter.js:125-130` slides a
shared indicator, `frontend/src/components/MobileTabBar.js:18-24` does the same.
These two popovers were simply never given the treatment.

## Target

Each popover scales up from the corner nearest its trigger and reverses on close.

| Property | Value | Source |
| --- | --- | --- |
| Transition | `springSnappy` = `{ type: 'spring', bounce: 0, duration: 0.22 }` | `frontend/src/utils/motion.js:17` |
| Reduced motion | `{ duration: 0 }` for the shared-element case, `reducedTransition` (`{ duration: 0.15, ease: 'easeOut' }`) with opacity only here | `frontend/src/utils/motion.js:33` |
| Enter from | `opacity: 0, scale: 0.96, y: -4` | `scale(0.96)` per "never `scale(0)`", target range 0.9–0.97 |
| Exit to | identical to enter — the path must be reversible | — |
| Origin — NotificationPanel | `origin-top lg:origin-top-right` (matches `lg:right-0 lg:top-full`) | — |
| Origin — BusinessSwitcher | `origin-top` (matches `left-1/2` centering) | — |

0.22s sits inside the 150–250ms budget for dropdowns. `bounce: 0` follows the
house rule at `frontend/src/utils/motion.js:8-10` — these panels did not come from
a gesture, so they must not overshoot.

### The trap in BusinessSwitcher

`BusinessSwitcher.js:80` centres the dropdown with the Tailwind class
`-translate-x-1/2`. Framer Motion writes a complete inline `transform`, which
**overrides that class** — animating `scale` naively will shove the dropdown half
its own width to the right. The centering must move into the motion values:

```jsx
/* target — frontend/src/components/BusinessSwitcher.js */
initial={{ opacity: 0, scale: 0.96, y: -4, x: '-50%' }}
animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
exit={{ opacity: 0, scale: 0.96, y: -4, x: '-50%' }}
```

…with `-translate-x-1/2` **removed** from the `className`. `x` must be present and
identical in all three states, or the dropdown will slide horizontally as it opens.

## Repo conventions to follow

- Springs come from `frontend/src/utils/motion.js`; never inline a spring literal.
- Reduced motion is read with `usePrefersReducedMotion()` from
  `frontend/src/hooks/useMediaQuery.js:22`.
  Exemplar: `frontend/src/components/ui/PillFilter.js:18,128` —
  `transition={reducedMotion ? { duration: 0 } : springSnappy}`.
- `AnimatePresence` wrapping a `{condition && <motion.div>}` block is the house
  pattern. Exemplar: `frontend/src/components/products/ProductFormModal.js:222-245`.

## Steps

### `frontend/src/components/NotificationPanel.js`

1. Extend the imports:

   ```jsx
   import { AnimatePresence, motion } from 'framer-motion';
   import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
   import { springSnappy, reducedTransition } from '../utils/motion';
   ```

2. Inside the component, alongside the existing `useState` declarations
   (`NotificationPanel.js:22-26`), add:

   ```jsx
   const reducedMotion = usePrefersReducedMotion();
   const popoverFrom = reducedMotion
     ? { opacity: 0 }
     : { opacity: 0, scale: 0.96, y: -4 };
   const popoverTo = reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 };
   const popoverTransition = reducedMotion ? reducedTransition : springSnappy;
   ```

3. Wrap the whole `{open && (…)}` block (`NotificationPanel.js:116` through its
   closing `)}`) in `<AnimatePresence>`.

4. Convert the backdrop `div` at `NotificationPanel.js:118` to a `motion.div` with
   `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}` and
   `transition={{ duration: 0.15 }}`. It stays `lg:hidden` and keeps its `onClick`.

5. Convert the panel `div` at `NotificationPanel.js:119-127` to a `motion.div`
   with `initial={popoverFrom}`, `animate={popoverTo}`, `exit={popoverFrom}`,
   `transition={popoverTransition}`. Keep `ref={panelRef}`, `role`, `aria-modal`,
   `aria-labelledby`, and `tabIndex` exactly as they are. Append
   `origin-top lg:origin-top-right` to the existing `className`, changing nothing
   else in that string.

### `frontend/src/components/BusinessSwitcher.js`

6. Extend the imports:

   ```jsx
   import { AnimatePresence, motion } from 'framer-motion';
   import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
   import { springSnappy, reducedTransition } from '../utils/motion';
   ```

7. Inside the component, after the `useState` declarations
   (`BusinessSwitcher.js:9-11`), add the same three constants as step 2, but with
   `x: '-50%'` included in every state:

   ```jsx
   const reducedMotion = usePrefersReducedMotion();
   const popoverFrom = reducedMotion
     ? { opacity: 0, x: '-50%' }
     : { opacity: 0, scale: 0.96, y: -4, x: '-50%' };
   const popoverTo = reducedMotion
     ? { opacity: 1, x: '-50%' }
     : { opacity: 1, scale: 1, y: 0, x: '-50%' };
   const popoverTransition = reducedMotion ? reducedTransition : springSnappy;
   ```

8. Wrap `{open && (<ul>…</ul>)}` (`BusinessSwitcher.js:76-97`) in
   `<AnimatePresence>` and change `<ul>` to `<motion.ul>` with
   `initial={popoverFrom}`, `animate={popoverTo}`, `exit={popoverFrom}`,
   `transition={popoverTransition}`.

9. In that same `className`, **delete `-translate-x-1/2`** and append `origin-top`.
   The class list becomes:
   `"absolute left-1/2 mt-1 w-[min(16rem,90vw)] rounded-xl border border-hairline/[0.07] bg-surface-1 shadow-lg py-1 z-50 origin-top"`.

## Boundaries

- Do NOT touch the open/close state logic, the outside-click and Escape listeners
  (`NotificationPanel.js:70-74`, `BusinessSwitcher.js:15-29`), the fetch logic, or
  the `handleSwitch` reload at `BusinessSwitcher.js:40`.
- Do NOT animate the notification badge at `NotificationPanel.js:109-113`.
- Do NOT animate the individual rows inside either popover. A stagger on a list
  that refetches would flicker; the container motion is the whole fix.
- Do NOT add `scale` to the mobile backdrop — opacity only.
- Do NOT change `z-index`, positioning, or `max-h` values.
- Do NOT add dependencies.
- If a step doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd frontend && npx craco build` completes with no new warnings.
- **Feel check**:
  - **BusinessSwitcher horizontal check, do this first**: sign in as an `admin`
    with more than one business (`BusinessSwitcher.js:13` gates on this — with one
    business the component renders a plain span and you will see nothing). Open the
    dropdown and confirm it stays horizontally centred under the trigger for the
    whole animation. Any sideways jump means step 9 was skipped.
  - Both popovers scale up *from the edge nearest their trigger*, not from their
    own centre — the notification panel's top-right corner should stay visually
    pinned to the bell on desktop.
  - Close each one: the exit plays. A popover that vanishes instantly means the
    conditional was left outside `AnimatePresence`.
  - Spam the bell open/closed quickly: the animation retargets smoothly from
    wherever it is and never restarts from zero or double-renders.
  - On a phone viewport, the notification panel is a near-full-width sheet — confirm
    the scale reads as subtle rather than a zoom, and that the `lg:hidden` backdrop
    fades rather than snapping.
  - In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: both
    popovers cross-fade over ~150ms with no scale and no movement, and the
    BusinessSwitcher dropdown is still centred.
- **Done when**: both popovers animate from their trigger, both exit, and the
  BusinessSwitcher dropdown never shifts horizontally.
