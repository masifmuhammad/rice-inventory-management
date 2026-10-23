import React, { useEffect, useState } from 'react';
import { FiRefreshCw, FiWifiOff } from 'react-icons/fi';
import { translate, useAppLanguage } from '../context/LanguageContext';

export default function ConnectionStatus() {
  useAppLanguage();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="fixed z-[100] top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(32rem,calc(100vw_-_2rem))] rounded-2xl border border-amber-500/30 bg-surface-1 shadow-lg p-4 flex items-start gap-3">
      <FiWifiOff className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-content">{translate("You’re offline")}</p>
        <p className="text-sm text-content-muted mt-0.5">{translate("Displayed figures may be out of date. Reconnect before saving changes.")}</p>
      </div>
      <button type="button" aria-label={translate("Retry connection")} title={translate("Retry connection")} onClick={() => window.dispatchEvent(new CustomEvent('rim:refresh'))} className="min-h-[44px] min-w-[44px] grid place-items-center rounded-lg hover:bg-surface-3 text-content-muted">
        <FiRefreshCw className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
