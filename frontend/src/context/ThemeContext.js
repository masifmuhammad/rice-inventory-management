import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'rim.theme';

/** @returns {'light' | 'dark' | 'system'} */
const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* non-fatal */
  }
  return 'system';
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveTheme = (preference) => {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemPrefersDark() ? 'dark' : 'light';
};

const applyTheme = (resolved) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0f0f0f' : '#059669');
  }
};

/** Apply before React paints so the first frame matches the saved preference. */
export const initTheme = () => {
  const preference = readStored();
  applyTheme(resolveTheme(preference));
  return preference;
};

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => initTheme());

  useEffect(() => {
    applyTheme(resolveTheme(preference));
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* non-fatal */
    }
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(resolveTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const resolved = useMemo(() => resolveTheme(preference), [preference]);

  const setTheme = useCallback((next) => {
    setPreference(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setTheme, isDark: resolved === 'dark' }),
    [preference, resolved, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

export default ThemeContext;
