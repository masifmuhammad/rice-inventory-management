import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';
import { fetchAiStatus } from '../services/assistantApi';

const AssistantContext = createContext(null);

const NAV_MAP = {
  dashboard: '/',
  products: '/products',
  transactions: '/transactions',
  'cash-book': '/cash-book',
  reports: '/reports',
  settings: '/settings',
};

export function AssistantProvider({ children }) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const [menuPinned, setMenuPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Let dashboard and settings load first — AI status is not on the critical path.
    const timer = window.setTimeout(() => {
      fetchAiStatus(controller.signal)
        .then((data) => {
          if (!cancelled) setEnabled(Boolean(data.enabled));
        })
        .catch(() => {
          if (!cancelled) setEnabled(false);
        });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const openPanel = useCallback((mode) => {
    setHubOpen(false);
    setMenuPinned(false);
    setPanel(mode);
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  const closeAll = useCallback(() => {
    setHubOpen(false);
    setMenuPinned(false);
    setPanel(null);
  }, []);

  const handleNavigateIntent = useCallback(
    (destination) => {
      const path = NAV_MAP[destination];
      if (path) {
        navigate(path);
        closeAll();
        toast.success(`Opened ${destination.replace('-', ' ')}`);
      }
    },
    [closeAll, navigate]
  );

  const value = useMemo(
    () => ({
      enabled,
      hubOpen,
      setHubOpen,
      panel,
      openPanel,
      closePanel,
      closeAll,
      menuPinned,
      setMenuPinned,
      handleNavigateIntent,
    }),
    [enabled, hubOpen, panel, openPanel, closePanel, closeAll, menuPinned, handleNavigateIntent]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export const useAssistant = () => {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
};

export default AssistantContext;
