import React from 'react';
import { NavLink } from 'react-router-dom';
import { FiClock, FiDollarSign, FiHome, FiPackage } from 'react-icons/fi';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import { feedbackTick } from '../utils/feedback';
import { useAuth } from '../context/AuthContext';
import { useShopMode } from '../context/ShopModeContext';
import { translate, useAppLanguage } from '../context/LanguageContext';
const TABS = [
  { name: 'Home', href: '/', icon: FiHome, end: true },
  { name: 'Stock', href: '/products', icon: FiPackage },
  { name: 'History', href: '/transactions', icon: FiClock },
  { name: 'Cash', href: '/cash-book', icon: FiDollarSign },
];
export default function MobileTabBar() {
  useAppLanguage();
  const { can } = useAuth();
  const prefetch = usePrefetchRoute();
  const shopMode = useShopMode();
  if (shopMode.enabled) return null;
  return (
    <nav aria-label={translate("Primary")} className="mobile-tabbar lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-hairline/[0.09] bg-surface-1 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex mx-auto max-w-xl px-3">
        {TABS.filter((tab) => tab.href !== '/cash-book' || can('cash.view')).map(({ name, href, icon: Icon, end }) => (
          <li key={href} className="flex-1 min-w-0">
            <NavLink to={href} end={end} onMouseEnter={() => prefetch(href)} onFocus={() => prefetch(href)} onTouchStart={() => prefetch(href)} onClick={() => feedbackTick()}
              className={({ isActive }) => ['flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-lg transition-[color,transform] duration-150 active:scale-95 motion-reduce:transform-none', isActive ? 'text-content font-semibold' : 'text-content-subtle font-normal'].join(' ')}>
              {({ isActive }) => <><Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.3 : 1.6} aria-hidden="true" /><span className="text-xs leading-none">{translate(name)}</span></>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
