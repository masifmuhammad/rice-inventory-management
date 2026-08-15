import React, { Suspense, useEffect, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import RouteSkeleton from './RouteSkeleton';

/**
 * The order the tab bar presents these in. Moving right through the tabs should
 * feel like moving right, which is only meaningful for routes that sit in a row
 * the user can see — anything reached from the drawer has no position in it.
 */
const TAB_ORDER = ['/', '/products', '/transactions', '/cash-book'];

const tabIndex = (pathname) =>
  TAB_ORDER.findIndex((path) => (path === '/' ? pathname === '/' : pathname.startsWith(path)));

/**
 * Route entrance.
 *
 * Between tabs the new screen comes in from the direction of travel, so going
 * Home → Stock and back again feel like opposite movements rather than the same
 * page re-appearing. Everywhere else it is a short vertical settle, because a
 * drawer route has no place in a left-to-right order and pretending otherwise
 * would be a lie about where the user is.
 *
 * Only the arriving page moves, and it moves in CSS.
 *
 * Cross-fading the outgoing page as well needs both mounted at once, which is
 * what `AnimatePresence mode="popLayout"` was doing here, and it cost far more
 * than it bought:
 *
 *  - the leaving page is pinned `position: absolute` at the top of the
 *    container while `ScrollToTop` resets the window to 0 — so leaving a list
 *    you had scrolled halfway down, the old screen visibly *jumped* to its own
 *    top before sliding away. A jump is not a transition.
 *  - popLayout measures the leaving child to pin it, forcing a full layout at
 *    the exact moment React is mounting the next route.
 *  - both pages render for the length of the animation, on a phone, on the
 *    thread that is already busy.
 *
 * A keyframe is the opposite of all three: the browser runs it on the
 * compositor, so a busy main thread cannot drop its frames, and it costs no
 * measurement, no second mounted tree, and no JS per frame. `key` on the
 * element is what restarts it — a new pathname is a new element.
 *
 * Direction and the reduced-motion and desktop variants live in the stylesheet
 * (`.route-enter`), so there are no media-query hooks re-rendering the whole
 * page tree to decide how to animate it.
 */
export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();

  // Where the last *tab* was. A drawer route leaves it alone, so Home →
  // Settings → Stock still arrives from the side Stock sits on.
  const previousTab = useRef(-1);
  const current = tabIndex(location.pathname);

  // Only a move between two known tabs has a direction. Anything else gets 0.
  const direction =
    current >= 0 && previousTab.current >= 0 && current !== previousTab.current
      ? Math.sign(current - previousTab.current)
      : 0;

  /**
   * Recorded after the commit, not during the render.
   *
   * Assigning to the ref inline is a mutation during render, and StrictMode
   * calls the render twice: the first pass wrote the new tab index, so the
   * second — the one that actually gets committed — compared the tab against
   * itself and always came out with no direction. Every navigation in
   * development animated as though it had no place in the tab order, which is
   * why the sideways movement was only ever visible in a production build.
   */
  useEffect(() => {
    if (current >= 0) previousTab.current = current;
  }, [current]);

  return (
    <div key={location.pathname} className="route-enter" data-direction={direction}>
      <Suspense fallback={<RouteSkeleton pathname={location.pathname} />}>{outlet}</Suspense>
    </div>
  );
}
