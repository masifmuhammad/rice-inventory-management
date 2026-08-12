import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const PageTitleContext = createContext({
  title: '',
  setTitle: () => {},
});

export function PageTitleProvider({ children }) {
  const [title, setTitleState] = useState('');
  const setTitle = useCallback((next) => {
    setTitleState(typeof next === 'string' ? next : '');
  }, []);

  const value = useMemo(() => ({ title, setTitle }), [title, setTitle]);

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}
