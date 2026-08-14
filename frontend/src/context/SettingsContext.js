import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { applyPalette } from '../utils/color';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

export const DEFAULT_SETTINGS = {
  businessName: 'My Business',
  tagline: 'Inventory Management System',
  primaryColor: '#059669',
  accentColor: '#10b981',
  currency: { code: 'PKR', symbol: 'Rs.' },
  logo: null,
  phone: '',
  email: '',
  address: { city: '', country: '' },
  receiptSettings: { footerText: 'Thank you for your business!', receiptPrefix: 'INV', showLogo: true },
};

const cacheKey = (businessId) => (businessId ? `rim.settings.${businessId}` : 'rim.settings');

const readCache = (businessId) => {
  try {
    const raw = localStorage.getItem(cacheKey(businessId));
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const writeCache = (businessId, settings) => {
  try {
    localStorage.setItem(cacheKey(businessId), JSON.stringify(settings));
  } catch {
    /* non-fatal */
  }
};

export function SettingsProvider({ children }) {
  const { user, businessId } = useAuth();
  const [settings, setSettings] = useState(() => readCache(businessId));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    applyPalette(settings.primaryColor);
  }, [settings.primaryColor]);

  useEffect(() => {
    const name = settings.businessName || DEFAULT_SETTINGS.businessName;
    document.title = name === DEFAULT_SETTINGS.businessName ? 'Inventory Management' : `${name} — Inventory`;
  }, [settings.businessName]);

  useEffect(() => {
    if (!user || !businessId) {
      // A cleared session must not leave the last tenant's branding behind.
      // `logout` reloads the page, but an *expired* session does not — so the
      // sign-in screen kept the previous business's name in the tab title, its
      // logo on the card and its brand colour on the button, shown to whoever
      // sits down at the terminal next.
      setSettings(DEFAULT_SETTINGS);
      return undefined;
    }

    setSettings(readCache(businessId));

    const controller = new AbortController();
    setLoading(true);

    api
      .get('/settings', { signal: controller.signal })
      .then(({ data }) => {
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        writeCache(businessId, merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const onBusinessChanged = () => {
      controller.abort();
    };
    window.addEventListener('rim:business-changed', onBusinessChanged);

    return () => {
      controller.abort();
      window.removeEventListener('rim:business-changed', onBusinessChanged);
    };
  }, [user, businessId]);

  const updateSettings = useCallback(
    async (patch) => {
      const { data } = await api.put('/settings', patch);
      const merged = { ...DEFAULT_SETTINGS, ...data };
      setSettings(merged);
      writeCache(businessId, merged);
      return merged;
    },
    [businessId]
  );

  const value = useMemo(() => {
    const symbol = settings.currency?.symbol || 'Rs.';

    return {
      settings,
      loading,
      updateSettings,
      businessName: settings.businessName || DEFAULT_SETTINGS.businessName,
      logo: settings.logo || null,
      currencySymbol: symbol,
    };
  }, [settings, loading, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
}

export default SettingsContext;
