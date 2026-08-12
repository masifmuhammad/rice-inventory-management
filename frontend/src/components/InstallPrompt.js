import React, { useEffect, useState } from 'react';
import { FiDownload, FiX } from 'react-icons/fi';
import Button from './ui/Button';

const DISMISS_KEY = 'rim.pwa.install.dismissed';

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return undefined;

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
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Install app"
      className="fixed bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+0.75rem)] inset-x-3 z-40 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
    >
      <div className="surface-card rounded-card p-4 shadow-lg flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-content">Install on your device</p>
          <p className="text-xs text-content-subtle mt-1">Add to your home screen for quick access offline.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" icon={FiDownload} onClick={install}>
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="p-2 rounded-lg hover:bg-hairline/[0.05]">
          <FiX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
