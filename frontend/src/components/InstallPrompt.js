import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiDownload, FiX } from 'react-icons/fi';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../utils/motion';
import Button from './ui/Button';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { translate, useAppLanguage } from '../context/LanguageContext';

const DISMISS_KEY = 'rim.pwa.install.dismissed';

export default function InstallPrompt() {
  useAppLanguage();
  const { user } = useAuth();
  const { businessName } = useSettings();
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    try { if (localStorage.getItem(DISMISS_KEY)) return undefined; } catch { /* Storage is optional. */ }

    const handler = (event) => {
      event.preventDefault();
      setPrompt(event);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setVisible(false);
    setPrompt(null);
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* Still dismiss in memory. */ }
    setVisible(false);
  };

  // The card is docked to an edge, so it enters and leaves along that edge —
  // same distance, same direction, so the motion reads as reversible.
  const enterTransition = reducedMotion ? reducedTransition : springUI;
  const enterFrom = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 16 };
  const enterTo = reducedMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0 };

  return (
    <AnimatePresence>
      {visible && user && (
        <motion.div
          role="region"
          aria-label={translate("Install app")}
          initial={enterFrom}
          animate={enterTo}
          exit={enterFrom}
          transition={enterTransition}
          className="fixed bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+5.5rem)] inset-x-3 z-[45] lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
        >
          <div className="surface-card rounded-card p-4 shadow-lg flex items-start gap-3">
            <BrandLogo size={40} rounded="rounded-xl" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-content">{translate("Install on your device")}</p>
              <p className="text-xs text-content-subtle mt-1">{translate("Add ")}{translate(businessName || 'your inventory app')}{translate(" to your home screen for quick access.")}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" icon={FiDownload} onClick={install}>{translate("Install")}</Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>{translate("Not now")}</Button>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label={translate("Dismiss install prompt")} className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-hairline/[0.05]">
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
