import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiDollarSign, FiHome, FiPackage, FiTrendingUp } from 'react-icons/fi';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';

const TABS = [
  { name: 'Home', href: '/', icon: FiHome, end: true },
  { name: 'Stock', href: '/products', icon: FiPackage },
  { name: 'Sales', href: '/transactions', icon: FiTrendingUp },
  { name: 'Cash', href: '/cash-book', icon: FiDollarSign },
];

/** The shared indicator that slides between tabs. */
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

function TabContent({ Icon, name, active }) {
  return (
    <span className="relative z-10 flex flex-col items-center justify-center gap-1">
      <Icon
        className="w-[22px] h-[22px]"
        strokeWidth={active ? 2.4 : 1.9}
        aria-hidden="true"
      />
      <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
        {name}
      </span>
    </span>
  );
}

const itemClasses = (active) =>
  [
    'relative w-full flex items-center justify-center min-h-[54px] rounded-well',
    'transition-colors duration-150 ease-out',
    'active:scale-[0.96] motion-reduce:active:scale-100',
    'transition-transform',
    active ? 'text-primary-500' : 'text-content-subtle',
  ].join(' ');

export default function MobileTabBar() {
  const location = useLocation();
  const prefetch = usePrefetchRoute();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 pointer-events-none
        px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="pointer-events-auto mx-auto max-w-md rounded-[22px] chrome-raised
          border border-hairline/[0.08]
          shadow-[0_8px_32px_-8px_rgb(0_0_0/0.18)] dark:shadow-[0_8px_32px_-4px_rgb(0_0_0/0.6)]"
      >
        <ul className="flex items-stretch gap-0.5 p-1.5">
          {TABS.map(({ name, href, icon: Icon, end }) => {
            const active = end
              ? location.pathname === href
              : location.pathname.startsWith(href);

            return (
              <li key={name} className="flex-1 min-w-0">
                <NavLink
                  to={href}
                  end={end}
                  onMouseEnter={() => prefetch(href)}
                  onFocus={() => prefetch(href)}
                  onTouchStart={() => prefetch(href)}
                  aria-current={active ? 'page' : undefined}
                  className={itemClasses(active)}
                >
                  {active && <ActivePill reducedMotion={reducedMotion} />}
                  <TabContent Icon={Icon} name={name} active={active} />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
