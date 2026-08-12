# 004 — Animate the stock-consequence preview like its sibling modal already does

- **Status**: DONE (applied 2026-08-12)
- **Commit**: 6320b4e + uncommitted working-tree changes (see plans/README.md → "Baseline")
- **Severity**: LOW
- **Category**: Cohesion & tokens / Missed opportunities
- **Estimated scope**: 1 file (`frontend/src/components/transactions/TransactionFormModal.js`), ~15 lines changed

## Problem

`TransactionFormModal` reveals a "before → after" stock preview once a product and
quantity are entered. It appears and disappears instantly, shoving the form below
it down by its full height on a single frame:

```jsx
/* frontend/src/components/transactions/TransactionFormModal.js:214-222 — current */
{/* Shows the consequence before it happens, so a typo is caught here
    rather than discovered in next month's stock count. */}
{preview && values.quantity !== '' && (
  <div
    className={`rounded-lg border px-4 py-3 ${
      preview.insufficient
        ? 'border-red-500/20 bg-red-500/10'
        : 'border-hairline/[0.07] bg-surface-sunken'
    }`}
  >
```

The sibling modal in the same folder tree already animates this exact class of
disclosure, with a transition constant written for the purpose:

```jsx
/* frontend/src/components/products/ProductFormModal.js:222-231 — the exemplar */
<AnimatePresence initial={false}>
  {showOtherCategory && (
    <motion.div
      key="other-category"
      initial={{ opacity: 0, height: 0, y: -6 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -4 }}
      transition={revealTransition}
      className="sm:col-span-2 overflow-hidden"
    >
```

Two modals, opened from adjacent pages, disclosing conditional content in two
different ways. This is a cohesion finding as much as a missing-animation one.

## Target

The preview reveals with the identical values already used at
`ProductFormModal.js:226-229` — not similar values, the same ones:

| Property | Value | Source |
| --- | --- | --- |
| Enter | `{ opacity: 0, height: 0, y: -6 }` → `{ opacity: 1, height: 'auto', y: 0 }` | `ProductFormModal.js:226-227` |
| Exit | `{ opacity: 0, height: 0, y: -4 }` | `ProductFormModal.js:228` |
| Transition | `springUI` = `{ type: 'spring', bounce: 0, duration: 0.35 }` | `frontend/src/utils/motion.js:14` |
| Reduced motion | `reducedTransition` = `{ duration: 0.15, ease: 'easeOut' }` | `frontend/src/utils/motion.js:33` |
| Required class | `overflow-hidden` on the animating wrapper | `ProductFormModal.js:230` |

`AnimatePresence` must carry `initial={false}` so that opening the modal in edit
mode — where a quantity is already filled in — does not play a reveal for content
that was there from the start.

Animating `height` is a layout-triggering property, which is normally a finding.
It is accepted here for the same reason it is accepted at `ProductFormModal.js:227`:
this is a disclosure inside a modal, at most a handful of times per session, and
the alternative (transform only) would leave the form below it jumping. Do not
"optimise" this into a transform.

## Repo conventions to follow

- Copy the shape of `frontend/src/components/products/ProductFormModal.js:222-245`
  precisely — same variant values, same `initial={false}`, same `overflow-hidden`.
- The transition constant is derived at the top of the component, not inline.
  Exemplar: `frontend/src/components/products/ProductFormModal.js:149` —
  `const revealTransition = reducedMotion ? reducedTransition : springUI;`
- Every `AnimatePresence` child needs a stable `key`.

## Steps

1. In `frontend/src/components/transactions/TransactionFormModal.js`, extend the
   imports (the file currently imports neither framer-motion nor the motion utils):

   ```jsx
   import React, { useEffect, useMemo, useState } from 'react';
   import { AnimatePresence, motion } from 'framer-motion';
   import { FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
   import { useSettings } from '../../context/SettingsContext';
   import { formatMoney, formatQuantity } from '../../utils/currency';
   import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
   import { springUI, reducedTransition } from '../../utils/motion';
   import Modal from '../ui/Modal';
   import Button from '../ui/Button';
   import { Input, Select, Textarea } from '../ui/Field';
   ```

2. Inside the component, next to the existing `preview` memo
   (`TransactionFormModal.js:86-104`), add:

   ```jsx
   const reducedMotion = usePrefersReducedMotion();
   const revealTransition = reducedMotion ? reducedTransition : springUI;
   ```

3. Wrap the conditional block at `TransactionFormModal.js:215` in
   `<AnimatePresence initial={false}>` and convert its outer `div` to a
   `motion.div`, preserving the existing comment above it:

   ```jsx
   <AnimatePresence initial={false}>
     {preview && values.quantity !== '' && (
       <motion.div
         key="stock-preview"
         initial={{ opacity: 0, height: 0, y: -6 }}
         animate={{ opacity: 1, height: 'auto', y: 0 }}
         exit={{ opacity: 0, height: 0, y: -4 }}
         transition={revealTransition}
         className="overflow-hidden"
       >
         <div
           className={`rounded-lg border px-4 py-3 ${
             preview.insufficient
               ? 'border-red-500/20 bg-red-500/10'
               : 'border-hairline/[0.07] bg-surface-sunken'
           }`}
         >
           {/* existing contents, unchanged */}
         </div>
       </motion.div>
     )}
   </AnimatePresence>
   ```

   Note the nesting: the `motion.div` is a **new** wrapper carrying
   `overflow-hidden`, and the original styled `div` becomes its child. Do not move
   the border/background classes onto the motion wrapper — animating `height` to 0
   on the bordered element itself would collapse the border into a visible line.

4. Leave everything inside the styled `div` (`TransactionFormModal.js:223-243`)
   exactly as it is — the insufficient-stock warning, the `before → after` row, and
   the total.

## Boundaries

- Do NOT touch the `preview` memo's logic, the validation at
  `TransactionFormModal.js:119-121`, or `handleSubmit`.
- Do NOT animate the numbers inside the preview. `before`, `after`, and the total
  update on every keystroke; they must keep swapping instantly. Only the container's
  mount and unmount animate.
- Do NOT apply this to `CashEntryModal.js` — it has no equivalent disclosure.
- Do NOT change `ProductFormModal.js`. It is the reference, not a target.
- Do NOT add dependencies.
- If a step doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd frontend && npx craco build` completes with no new warnings.
- **Feel check**: open Transactions → New transaction.
  - Pick a product, then type a quantity. The preview expands smoothly and the
    fields below it are pushed down over the same 0.35s, with no snap.
  - Clear the quantity field: the preview collapses rather than vanishing.
  - Type rapidly — `1`, `12`, `123`, then backspace to empty. The numbers inside
    update instantly with no lag, and the container never restarts its reveal
    mid-flight.
  - Set a stock-out quantity larger than available stock: the panel switches to the
    red insufficient-stock variant. Its height changes as the text rewraps; confirm
    that re-measure looks settled rather than jittery.
  - Open the modal in **edit** mode on an existing transaction (a row with a
    quantity already set): the preview must be present immediately with **no**
    entrance animation. If it animates on open, `initial={false}` is missing.
  - Compare side by side with Products → Add product → Category "Other", which
    reveals its extra field. The two should feel identical.
  - In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the reveal
    becomes a 150ms fade with the height still resolving, so the layout does not jump.
- **Done when**: the preview reveals and collapses using the same values as
  `ProductFormModal.js:226-229`, and edit mode shows it without an entrance.
