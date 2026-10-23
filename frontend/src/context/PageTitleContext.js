import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translate, useAppLanguage } from './LanguageContext';

const PageTitleContext = createContext({
  title: '',
  setTitle: () => {},
});

export function PageTitleProvider({ children }) {
  useAppLanguage();
  const [title, setTitleState] = useState('');
  const [summary, setSummary] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const setTitle = useCallback((next) => {
    setTitleState(typeof next === 'string' ? next : '');
  }, []);

  const value = useMemo(() => ({ title, setTitle, summary, setSummary, collapsed, setCollapsed }), [title, setTitle, summary, collapsed]);

  return <PageTitleContext.Provider value={value}>{translate(children)}</PageTitleContext.Provider>;
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}
