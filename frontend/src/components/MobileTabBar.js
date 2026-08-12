import React, { useCallback, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiDollarSign, FiHome, FiPackage, FiTrendingUp } from 'react-icons/fi';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springSnappy, springUI, withReducedMotion } from '../utils/motion';
import { feedbackTick } from '../utils/feedback';

const TABS = [
  { name: 'Home', href: '/', icon: FiHome, end: true },
  { name: 'Stock', href: '/products', icon: FiPackage },
  { name: 'Sales', href: '/transactions', icon: FiTrendingUp },
  { name: 'Cash', href: '/cash-book', icon: FiDollarSign },
];

/**
 * Floating iOS-style tab bar: frosted capsule + solid selection thumb.
 * The thumb follows the finger while dragging and only navigates on release —
 * same interaction model as PillFilter.
 */
export default function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefetch = usePrefetchRoute();
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);

  const selectedIndex = TABS.findIndex(({ href, end }) =>
    end ? location.pathname === href : location.pathname.startsWith(href)
  );
  const activeIndex = dragIndex ?? (selectedIndex < 0 ? 0 : selectedIndex);
  const dragging = dragIndex !== null;
  const pillTransition = withReducedMotion(dragging ? springSnappy : springUI, reducedMotion);

  const indexFromPointer = useCallback((clientX) => {
    const segments = trackRef.current?.querySelectorAll('[data-tab]');
    if (!segments?.length) return null;

    let closest = 0;
    let shortest = Infinity;

    segments.forEach((segment, index) => {
      const rect = segment.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < shortest) {
        shortest = distance;
        closest = index;
      }
    });

    return closest;
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const next = indexFromPointer(event.clientX);
    if (next === null) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragIndex(next);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const next = indexFromPointer(event.clientX);
    if (next !== null && next !== dragIndex) setDragIndex(next);
  };

  const endDrag = (event) => {
    if (!dragging) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const committed = TABS[dragIndex];
    setDragIndex(null);

    if (!committed) return;

    const alreadyThere = committed.end
      ? location.pathname === committed.href
      : location.pathname.startsWith(committed.href);

    if (!alreadyThere) {
      feedbackTick();
      navigate(committed.href);
    }
  };

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 pointer-events-none
        px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="pointer-events-auto mx-auto max-w-md
          rounded-[28px]
          border border-white/40 dark:border-white/[0.1]
          bg-surface-1/75 dark:bg-surface-2/70
          shadow-[0_10px_40px_-12px_rgb(0_0_0/0.28),inset_0_1px_0_rgb(255_255_255/0.55)]
          dark:shadow-[0_12px_40px_-8px_rgb(0_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.08)]
          backdrop-blur-[24px] backdrop-saturate-[180%]
          supports-[backdrop-filter]:bg-surface-1/55 dark:supports-[backdrop-filter]:bg-surface-2/50"
      >
        <ul
          ref={trackRef}
          className="relative flex items-stretch gap-0.5 p-1.5 rounded-[24px]"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {TABS.map(({ name, href, icon: Icon, end }, index) => {
            const routeActive = end
              ? location.pathname === href
              : location.pathname.startsWith(href);
            const active = index === activeIndex;

            return (
              <li key={name} className="relative flex-1 min-w-0">
                <NavLink
                  data-tab
                  to={href}
                  end={end}
                  onMouseEnter={() => prefetch(href)}
                  onFocus={() => prefetch(href)}
                  onTouchStart={() => prefetch(href)}
                  onClick={(event) => {
                    // Pointer already committed on pointerup — skip the
                    // duplicate navigation that a mouse/touch click would fire.
                    if (event.detail !== 0) {
                      event.preventDefault();
                      return;
                    }
                    if (!routeActive) feedbackTick();
                  }}
                  aria-current={routeActive ? 'page' : undefined}
                  className={[
                    'relative z-10 flex w-full flex-col items-center justify-center gap-0.5',
                    'min-h-[52px] rounded-[20px] select-none',
                    'transition-colors duration-150 ease-out',
                    'active:scale-[0.96] motion-reduce:active:scale-100',
                    'transition-transform',
                    active ? 'text-primary-600 dark:text-primary-400' : 'text-content-subtle',
                  ].join(' ')}
                >
                  {active && (
                    <motion.span
                      layoutId="tabbar-active-thumb"
                      className={`absolute inset-0 rounded-[20px] segmented-thumb
                        ring-1 ring-black/[0.04] dark:ring-white/[0.06]
                        ${dragging ? 'segmented-thumb-held' : ''}`}
                      transition={pillTransition}
                      aria-hidden="true"
                    />
                  )}

                  <span className="relative z-10 flex flex-col items-center justify-center gap-1 pt-0.5 pointer-events-none">
                    <Icon
                      className="w-[22px] h-[22px]"
                      strokeWidth={active ? 2.35 : 1.85}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-[10px] leading-none tracking-tight ${
                        active ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {name}
                    </span>
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
