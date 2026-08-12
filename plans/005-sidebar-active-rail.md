# 005 — Slide the sidebar's active rail instead of cross-fading it

- **Status**: DONE (applied 2026-08-12)
- **Commit**: 6320b4e + uncommitted working-tree changes (see plans/README.md → "Baseline")
- **Severity**: LOW
- **Category**: Cohesion & tokens / Physicality & origin
- **Estimated scope**: 1 file (`frontend/src/components/Layout.js`), ~20 lines changed

## Problem

The desktop sidebar marks the active route with a small rail that cross-fades
independently on every link — one fades out, another fades in, so the indicator
blinks between positions rather than travelling:

```jsx
/* frontend/src/components/Layout.js:103-110 — current */
{({ isActive }) => (
  <>
    <span
      className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full transition-opacity ${
        isActive ? 'bg-primary-500 opacity-100' : 'opacity-0'
      }`}
      aria-hidden="true"
    />
```

The mobile tab bar already does the same job correctly, with a single shared
element that springs between tabs:

```jsx
/* frontend/src/components/MobileTabBar.js:16-24 — the exemplar */
function ActivePill({ reducedMotion }) {
  return (
    <motion.span
      layoutId="tabbar-active"
      className="absolute inset-x-1 inset-y-0 rounded-well bg-primary-500/12"
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 }}
      aria-hidden="true"
    />
  );
}
```

Same product, same indicator, two different behaviours depending on viewport.

This is a high-frequency surface, so the motion must stay fast and must never
delay anything. It does not: route content mounts immediately and independently
(`frontend/src/utils/motion.js:44-47` documents the deliberate absence of a route
exit animation), so the rail animating is purely additive.

## Target

One shared `motion.span` per nav instance, rendered only for the active link, using
`springSnappy` — 0.22s, faster than the tab bar's 0.35s because the sidebar is hit
far more often.

| Property | Value | Source |
| --- | --- | --- |
| Transition | `springSnappy` = `{ type: 'spring', bounce: 0, duration: 0.22 }` | `frontend/src/utils/motion.js:17` |
| Reduced motion | `{ duration: 0 }` — the rail jumps, matching the tab bar | `MobileTabBar.js:21` |
| `layoutId` | `` `sidebar-active-${navId}` `` — per instance, see below | pattern from `PillFilter.js:126` |

### The trap: `NavigationLinks` is mounted twice at once

`NavigationLinks` is rendered in two places that are **both in the DOM
simultaneously**:

- `frontend/src/components/Layout.js:252` — the desktop sidebar, inside
  `<aside className="hidden lg:flex …">`. `hidden` is CSS, not unmounting.
- `frontend/src/components/Layout.js:292` — the mobile drawer, inside a Headless UI
  `Dialog` that stays mounted with the `open` prop.

A hardcoded `layoutId="sidebar-active"` would be claimed by two live elements and
framer-motion's layout projection would try to reconcile them — producing a rail
that flies between the sidebar and the drawer. The `layoutId` must be scoped per
instance, exactly as `frontend/src/components/ui/PillFilter.js:126` already does:
`` layoutId={`segmented-thumb-${ariaLabel || 'default'}`} ``.

### The second trap: the transform class

The current rail centres itself with `top-1/2 -translate-y-1/2`. Framer Motion
writes a complete inline `transform` for layout projection, which **overrides that
class** — the rail would sit low by half its height. Replace the transform-based
centering with auto margins, which projection does not touch:

```jsx
/* target */
<motion.span
  layoutId={`sidebar-active-${navId}`}
  transition={reducedMotion ? { duration: 0 } : springSnappy}
  className="absolute left-0 inset-y-0 my-auto w-0.5 h-5 rounded-full bg-primary-500"
  aria-hidden="true"
/>
```

`inset-y-0 my-auto` on a fixed-height absolutely positioned element centres it
vertically with no transform involved.

## Repo conventions to follow

- Shared-element indicators use a bare `layoutId` with no `AnimatePresence`
  wrapper — when one unmounts and another mounts in the same commit, framer-motion
  animates between them. Exemplar: `frontend/src/components/MobileTabBar.js:84`,
  `{active && <ActivePill reducedMotion={reducedMotion} />}`.
- Never put a `transform` (including a Tailwind `scale-*` / `translate-*` class) on
  an element carrying a `layoutId`. This is documented in-repo at
  `frontend/src/components/ui/PillFilter.js:122-124`:
  *"No scale here on purpose: a transform on the same element as a `layoutId`
  fights the layout projection and distorts the pill."*
- Springs come from `frontend/src/utils/motion.js`; reduced motion is read with
  `usePrefersReducedMotion()` from `frontend/src/hooks/useMediaQuery.js:22`.

## Steps

1. In `frontend/src/components/Layout.js`, confirm `motion` is already imported
   (it is, at `Layout.js:4`) and add `springSnappy` to the existing import from
   `../utils/motion`.

2. Change the `NavigationLinks` signature at `Layout.js:64` to accept an instance
   id, and read the motion preference:

   ```jsx
   function NavigationLinks({ onNavigate, sections, navId }) {
     const prefetch = usePrefetchRoute();
     const navigate = useNavigate();
     const location = useLocation();
     const reducedMotion = usePrefersReducedMotion();
   ```

3. Replace the rail `<span>` at `Layout.js:105-110` with the conditional shared
   element. The rail is now rendered **only when active**, instead of always
   rendered at `opacity-0`:

   ```jsx
   {({ isActive }) => (
     <>
       {isActive && (
         <motion.span
           layoutId={`sidebar-active-${navId}`}
           transition={reducedMotion ? { duration: 0 } : springSnappy}
           className="absolute left-0 inset-y-0 my-auto w-0.5 h-5 rounded-full bg-primary-500"
           aria-hidden="true"
         />
       )}
       <Icon
         className="w-[18px] h-[18px] flex-shrink-0"
         strokeWidth={isActive ? 2.3 : 1.9}
         aria-hidden="true"
       />
       <span className="truncate">{name}</span>
     </>
   )}
   ```

4. Pass a distinct `navId` at both call sites:
   - `Layout.js:252` → `<NavigationLinks sections={navSections} navId="sidebar" />`
   - `Layout.js:292` → `<NavigationLinks sections={navSections} onNavigate={closeDrawer} navId="drawer" />`

## Boundaries

- Do NOT touch `MobileTabBar.js`. It is the reference implementation and already correct.
- Do NOT change `linkClasses` at `Layout.js:55-62`, including its
  `transition-colors duration-150` and the active background `bg-primary-500/12`.
  Only the rail becomes a shared element; the link's own background keeps
  cross-fading, which is correct for a colour change.
- Do NOT change the `strokeWidth` swap at `Layout.js:113` or animate the icon.
- Do NOT add a `scale`, `translate`, or any other transform class to the
  `motion.span` — see the PillFilter comment cited above.
- Do NOT add `AnimatePresence`; `layoutId` handles the handoff on its own, and
  wrapping it would make the old rail linger and animate to the wrong place.
- Do NOT extend this to the route content itself. The lack of a route exit
  animation is a documented, deliberate decision (`frontend/src/utils/motion.js:44-47`).
- Do NOT add dependencies.
- If a step doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd frontend && npx craco build` completes with no new warnings.
- **Feel check**, on a desktop viewport ≥1024px:
  - Click through Dashboard → Products → Transactions: one rail slides down the
    sidebar. It must not fade out and in.
  - Jump from a main-nav item to an admin item (Settings → Users, as an `admin`
    account). The rail travels across the section gap in one move.
  - The rail is vertically centred on its link at rest and mid-flight. If it sits
    low, the `-translate-y-1/2` removal in step 3 was missed.
  - **Double-mount check**: open the mobile drawer at a narrow viewport, navigate,
    then widen the window to desktop. The rail must never fly between the drawer
    and the sidebar, and there must never be two rails visible. If either happens,
    `navId` is not being passed at one of the two call sites.
  - Scroll the sidebar nav (it is `overflow-y-auto` at `Layout.js:83`; add enough
    admin items or shorten the window) and then navigate. Confirm the rail lands on
    the correct link rather than at a stale offset.
  - Click nav items rapidly. The rail retargets from its current position and never
    restarts from the top.
  - Confirm the route content still appears immediately on click — the rail must
    not gate navigation in any way.
  - In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the rail
    jumps instantly to the new link with no travel.
- **Done when**: a single rail slides between links in both nav instances
  independently, stays vertically centred, and navigation timing is unchanged.
