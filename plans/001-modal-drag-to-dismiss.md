# 001 — Make the mobile modal grabber actually drag to dismiss

- **Status**: DONE (applied 2026-08-12)
- **Commit**: 6320b4e + uncommitted working-tree changes (see plans/README.md → "Baseline")
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Physicality & origin
- **Estimated scope**: 1 file (`frontend/src/components/ui/Modal.js`), ~40 lines changed

## Problem

`frontend/src/components/ui/Modal.js:56-58` renders a grabber pill on phones, the
universal affordance for "drag me down to close". Nothing is draggable. Every
mobile modal in the app shows this false promise: the product form, the
transaction form, the cash entry form, the confirm dialog, and the profile sheet
all render through this one component.

```jsx
/* frontend/src/components/ui/Modal.js:56-58 — current */
<div className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0">
  <div className="w-10 h-1 rounded-full bg-hairline/[0.08]" />
</div>
```

The repo's motion vocabulary already anticipated this. `frontend/src/utils/motion.js:19-23`
defines two spring configs specifically for gesture-adjacent surfaces, and
**neither has a single caller anywhere in the codebase**:

```js
/* frontend/src/utils/motion.js:19-23 — current, unused */
/** Sheets and drawers: a trace of overshoot, because they are gesture-adjacent. */
export const springSheet = { type: 'spring', bounce: 0.14, duration: 0.4 };

/** Only after a flick or drag release, where momentum already exists. */
export const springMomentum = { type: 'spring', bounce: 0.2, duration: 0.4 };
```

This plan wires `springSheet` to the surface it was written for.

## Target

The grabber becomes the drag handle. Dragging it down moves the sheet 1:1;
dragging up is rubber-banded rather than dead-stopped. Releasing either dismisses
the modal or springs it back to rest with `springSheet`.

Structural change: `DialogPanel` currently carries both the open/close transition
*and* the visual card styling. Split them — `DialogPanel` keeps the Headless UI
transition classes, and a new inner `motion.div` becomes the visual card and the
drag target. The two transforms compose (parent animates enter/exit, child
animates drag) instead of fighting over the same `transform` property.

```jsx
/* target — frontend/src/components/ui/Modal.js */
<DialogPanel
  transition
  className={`relative w-full ${sizes[size] || sizes.md}
    transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
    data-[closed]:opacity-0 data-[closed]:blur-[2px]
    data-[closed]:translate-y-6 sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-[0.97]
    motion-reduce:duration-150 motion-reduce:data-[closed]:translate-y-0 motion-reduce:data-[closed]:scale-100 motion-reduce:data-[closed]:blur-0`}
>
  <motion.div
    drag="y"
    dragControls={dragControls}
    dragListener={false}
    dragConstraints={{ top: 0, bottom: 0 }}
    dragElastic={{ top: 0.1, bottom: 1 }}
    onDragEnd={handleDragEnd}
    style={{ y }}
    className="bg-surface-1 shadow-2xl rounded-t-card sm:rounded-card
      max-h-[92vh] sm:max-h-[88vh] flex flex-col"
  >
    {/* grabber + header + body + footer, unchanged apart from the grabber row */}
  </motion.div>
</DialogPanel>
```

Exact values:

| Behaviour | Value | Source |
| --- | --- | --- |
| Snap-back spring | `springSheet` = `{ type: 'spring', bounce: 0.14, duration: 0.4 }` | `frontend/src/utils/motion.js:20` |
| Snap-back, reduced motion | `reducedTransition` = `{ duration: 0.15, ease: 'easeOut' }` | `frontend/src/utils/motion.js:33` |
| Flick dismissal | `info.velocity.y > 110` **and** `info.offset.y > 0` | 0.11 px/ms swipe-velocity threshold |
| Distance dismissal | `info.offset.y > 120` | — |
| Downward resistance | `dragElastic.bottom: 1` (free, 1:1) | — |
| Upward resistance | `dragElastic.top: 0.1` (rubber-band, not a hard stop) | — |

**Drag must only start from the grabber**, via `useDragControls` with
`dragListener={false}`. This is not a style preference — the modal body is
`overflow-y-auto` (`Modal.js:82`), and a panel-wide drag listener would hijack
content scrolling on every form in the app. It also makes the feature
mobile-only for free: the grabber is `sm:hidden`, so a desktop pointer has
nothing to start a drag from.

## Repo conventions to follow

- Spring configs are imported from `frontend/src/utils/motion.js` — never inline a
  spring literal. The house rule documented at `motion.js:8-10` is `bounce: 0` by
  default, with overshoot **reserved for motion the user physically started**.
  A drag release is exactly that case, so `springSheet` is the correct choice here.
- Reduced motion is read with `usePrefersReducedMotion()` from
  `frontend/src/hooks/useMediaQuery.js:22` and branched at the call site.
  Exemplar: `frontend/src/components/products/ProductFormModal.js:149`
  — `const revealTransition = reducedMotion ? reducedTransition : springUI;`
- Framer Motion is already a dependency (`framer-motion@^12.26.2`). Do not add anything.

## Steps

1. In `frontend/src/components/ui/Modal.js`, extend the imports:

   ```jsx
   import React, { useEffect } from 'react';
   import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
   import { animate, motion, useDragControls, useMotionValue } from 'framer-motion';
   import { FiX } from 'react-icons/fi';
   import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
   import { springSheet, reducedTransition } from '../../utils/motion';
   ```

2. Inside the `Modal` component, after the existing `handleClose` declaration
   (`Modal.js:29`), add the drag state:

   ```jsx
   const reducedMotion = usePrefersReducedMotion();
   const dragControls = useDragControls();
   const y = useMotionValue(0);
   const snapTransition = reducedMotion ? reducedTransition : springSheet;

   // A dismissed sheet keeps whatever offset it was flung to. Reset on reopen so
   // the next modal does not mount already pushed down the screen.
   useEffect(() => {
     if (open) y.set(0);
   }, [open, y]);

   const handleDragEnd = (event, info) => {
     const dismissable = !disableClose && !busy;
     const flicked = info.velocity.y > 110 && info.offset.y > 0;
     const dragged = info.offset.y > 120;

     if (dismissable && (flicked || dragged)) {
       onClose();
       return;
     }
     animate(y, 0, snapTransition);
   };
   ```

3. Rewrite the `DialogPanel` opening tag (`Modal.js:47-55`) to drop the visual
   classes, keeping only positioning and the Headless UI transition classes.
   Remove `bg-surface-1`, `shadow-2xl`, `rounded-t-card`, `sm:rounded-card`,
   `max-h-[92vh]`, `sm:max-h-[88vh]`, and `flex flex-col` from its `className` —
   they move to the new inner element in step 4. Keep the existing comment above it.

4. Immediately inside `DialogPanel`, wrap all of its current children in the
   draggable card, using the `motion.div` shown in the Target section above. The
   header, body, and footer blocks (`Modal.js:60-94`) move inside it unchanged.

5. Replace the grabber row (`Modal.js:56-58`) with a version that starts the drag:

   ```jsx
   <div
     className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
     style={{ touchAction: 'none' }}
     onPointerDown={(event) => dragControls.start(event)}
     aria-hidden="true"
   >
     <div className="w-10 h-1 rounded-full bg-hairline/[0.08]" />
   </div>
   ```

   `touchAction: 'none'` on the handle only — do not put it on the panel, or the
   modal body stops scrolling on touch.

## Boundaries

- Do NOT touch any modal consumer: `ProductFormModal.js`, `TransactionFormModal.js`,
  `CashEntryModal.js`, `ConfirmProvider.js`, `ProfileSheet.js`. The whole point is
  that they inherit this for free. Their props and markup stay identical.
- Do NOT touch the sidebar drawer at `Layout.js:262-300`. It is a different Dialog
  with a different axis and is out of scope.
- Do NOT change the `DialogBackdrop` at `Modal.js:37-41`.
- Do NOT remove the `Dialog`'s `open` prop or switch to conditional unmounting.
  The comment at `Modal.js:12-16` documents a real runtime error there; this plan
  deliberately keeps the Headless UI transition intact.
- Do NOT "optimise" `style={{ y }}` into an `animate={{ transform: ... }}` prop.
  A `MotionValue` bound through `style` writes to the element's transform directly
  without a React re-render — that is the fast path, not a shorthand to be replaced.
- Do NOT add dependencies (`vaul`, `react-use-gesture`, etc.).
- If a step doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd frontend && npx craco build` completes with no new warnings.
  There is no typecheck step in this project (plain JS + CRA/craco).
- **Feel check** — must be done on a real phone or Chrome DevTools device emulation
  with touch simulation, not a desktop mouse:
  - Open any modal (Products → Add product). Drag the grabber down slowly: the
    sheet follows your finger 1:1, with no lag or rubber-banding on the way down.
  - Release at a small offset (~40px): the sheet springs back to rest and settles
    without a visible wobble — `bounce: 0.14` should read as "confident", not "boingy".
  - Drag past ~120px and release: the modal closes.
  - Flick down sharply from a small offset and release: the modal closes on
    velocity alone, without needing the full distance.
  - Try to drag the handle **up**: it barely moves and resists — it must not
    detach and fly upward, and it must not hard-stop dead at zero.
  - Scroll the modal body (the product form is long enough to scroll): content
    scrolls normally and the sheet does not move. This is the regression most
    likely to break — check it explicitly.
  - Open the delete-confirm dialog and drag it down while the confirm button is
    mid-request (`busy`): the sheet must spring back, not dismiss.
  - On a desktop viewport (≥640px), the grabber is hidden and the dialog cannot be
    dragged at all; the existing scale/blur open animation is unchanged.
  - In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: drag still
    tracks the finger (direct manipulation is not vestibular motion), but the
    snap-back becomes a 150ms ease-out with no overshoot.
- **Done when**: the grabber drags, dismisses on both distance and flick, body
  scrolling is unaffected, and no consumer component was modified.
