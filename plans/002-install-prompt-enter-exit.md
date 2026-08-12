# 002 — Give the install prompt an entrance and a matching exit

- **Status**: DONE (applied 2026-08-12)
- **Commit**: 6320b4e + uncommitted working-tree changes (see plans/README.md → "Baseline")
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`frontend/src/components/InstallPrompt.js`), ~20 lines changed

## Problem

The PWA install banner appears and disappears instantly. It is an unrequested
surface that materialises over the app while the user is doing something else —
exactly the case where a bridge matters most — and it currently teleports.

```jsx
/* frontend/src/components/InstallPrompt.js:37-45 — current */
if (!visible) return null;

return (
  <div
    role="region"
    aria-label="Install app"
    className="fixed bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+0.75rem)] inset-x-3 z-40 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
  >
    <div className="surface-card rounded-card p-4 shadow-lg flex items-start gap-3">
```

Both dismissal paths — `install()` at `InstallPrompt.js:24-30` and `dismiss()` at
`InstallPrompt.js:32-35` — call `setVisible(false)`, so the card vanishes on a
frame boundary with no exit at all.

This is the rarest surface in the app: it fires once, on `beforeinstallprompt`, and
never again after dismissal (`localStorage` guard at `InstallPrompt.js:12`). Rare,
first-time moments are where the delight budget is allowed to be spent.

## Target

The card rises from the edge it is docked to and leaves the same way, so the
motion is reversible and spatially honest.

```jsx
/* target */
<AnimatePresence>
  {visible && (
    <motion.div
      role="region"
      aria-label="Install app"
      initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
      transition={enterTransition}
      className="fixed bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+0.75rem)] inset-x-3 z-40 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
    >
      …
    </motion.div>
  )}
</AnimatePresence>
```

| Property | Value | Source |
| --- | --- | --- |
| Transition | `springUI` = `{ type: 'spring', bounce: 0, duration: 0.35 }` | `frontend/src/utils/motion.js:14` |
| Reduced motion | `reducedTransition` = `{ duration: 0.15, ease: 'easeOut' }`, and `y`/`filter` dropped so only opacity animates | `frontend/src/utils/motion.js:33` |
| Offset | `y: 16` — toward the bottom edge it is docked to, entering and exiting identically | — |
| Blur | `4px` — matches `routeVariants` and `staggerItem` | `frontend/src/utils/motion.js:49,73` |

`bounce: 0` is deliberate. The house rule at `frontend/src/utils/motion.js:8-10`
reserves overshoot for motion the user physically started; this card arrives on
its own, so it must not bounce.

## Repo conventions to follow

- The app's entrance signature is `opacity` + `y` + `blur(4px)`, defined once in
  `frontend/src/utils/motion.js:48-56` (`routeVariants`) and `:72-75` (`staggerItem`).
  Reuse those values rather than inventing a new distance or blur radius.
- Reduced motion swaps the *variants*, not just the duration — see
  `frontend/src/pages/Login.js:34`:
  `const item = reducedMotion ? staggerItemReduced : staggerItem;`
- `AnimatePresence` + `motion.div` on a conditional block is already the house
  pattern. Exemplar: `frontend/src/components/products/ProductFormModal.js:222-245`.

## Steps

1. In `frontend/src/components/InstallPrompt.js`, extend the imports:

   ```jsx
   import React, { useEffect, useState } from 'react';
   import { AnimatePresence, motion } from 'framer-motion';
   import { FiDownload, FiX } from 'react-icons/fi';
   import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
   import { springUI, reducedTransition } from '../utils/motion';
   import Button from './ui/Button';
   ```

2. Inside the component, before the return, add the motion-preference branch:

   ```jsx
   const reducedMotion = usePrefersReducedMotion();

   const enterTransition = reducedMotion ? reducedTransition : springUI;
   const enterFrom = reducedMotion
     ? { opacity: 0 }
     : { opacity: 0, y: 16, filter: 'blur(4px)' };
   const enterTo = reducedMotion
     ? { opacity: 1 }
     : { opacity: 1, y: 0, filter: 'blur(0px)' };
   ```

3. Delete the early return at `InstallPrompt.js:37` (`if (!visible) return null;`).
   `AnimatePresence` needs to stay mounted to play the exit, so the conditional
   moves inside the returned tree.

4. Replace the outer `<div>` at `InstallPrompt.js:40-44` with the
   `AnimatePresence` + `motion.div` structure from the Target section, wiring
   `initial={enterFrom}`, `animate={enterTo}`, `exit={enterFrom}`, and
   `transition={enterTransition}`. Keep `role`, `aria-label`, and the entire
   `className` string byte-for-byte — the safe-area and tab-bar offsets in it are
   load-bearing on mobile.

5. Leave the inner card (`InstallPrompt.js:45-61`) untouched, including the two
   `Button`s and the close button.

## Boundaries

- Do NOT change the install or dismissal logic: the `beforeinstallprompt` listener
  (`InstallPrompt.js:11-22`), the `DISMISS_KEY` localStorage guard, and both
  handlers keep their current behaviour exactly.
- Do NOT alter the positioning classes. The `calc()` with
  `var(--app-tabbar-height)` and `env(safe-area-inset-top)` must survive verbatim.
- Do NOT add a `scale` to the entrance — this card is docked to an edge, so the
  spatial story is translation along that edge, not a pop.
- Do NOT add a stagger to the buttons inside the card.
- Do NOT add dependencies.
- If a step doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd frontend && npx craco build` completes with no new warnings.
- **Feel check**: `beforeinstallprompt` is hard to fire on demand — temporarily
  drive the component with a local `useState(true)` default, or dispatch a synthetic
  event from the console, then **revert that scaffolding** before finishing.
  - The card rises into place from below and does not pop.
  - Clicking "Not now" plays a visible exit downward — the card must not disappear
    on a single frame. This is the half most likely to be missed, because
    `AnimatePresence` silently does nothing if the conditional is left outside it.
  - Entrance and exit travel the same distance in the same direction.
  - In DevTools → Animations panel at 10% playback speed, confirm the blur resolves
    together with the movement rather than lingering after the card has settled.
  - In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the card
    cross-fades with no vertical travel and no blur, still over ~150ms.
  - On a phone viewport, confirm the card still sits clear of the mobile tab bar
    in its resting position.
- **Done when**: both entrance and exit animate, the positioning is pixel-identical
  to before at rest, and the dismissal logic is unchanged.
