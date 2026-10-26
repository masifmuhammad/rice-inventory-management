import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { readPendingLedger } from '../hooks/useLedgerSubmission';

const ShopModeContext = createContext(null);
const read = (key) => { try { return localStorage.getItem(key) === 'true'; } catch { return false; } };
export function ShopModeProvider({ children }) {
  const { user, businessId } = useAuth();
  const key = `rim.shop-mode.${user?.id || user?._id}.${businessId}`;
  const [choice, setChoice] = useState(() => ({ key, enabled: read(key) }));
  const [pending, setPending] = useState(false);
  const enabled = Boolean(user && businessId && (choice.key === key ? choice.enabled : read(key)));
  const value = useMemo(() => ({ enabled, pending: pending || Boolean(readPendingLedger('shop', user?.id || user?._id, businessId)), setPending, setEnabled: (next) => {
    setChoice({ key, enabled: next });
    try { localStorage.setItem(key, String(next)); } catch { /* The current session still works. */ }
  } }), [enabled, key, pending, user?.id, user?._id, businessId]);
  useEffect(() => {
    document.documentElement.dataset.shopMode = String(enabled);
    return () => { delete document.documentElement.dataset.shopMode; };
  }, [enabled]);
  return <ShopModeContext.Provider value={value}>{children}</ShopModeContext.Provider>;
}
export const useShopMode = () => useContext(ShopModeContext);
