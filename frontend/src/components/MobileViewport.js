import { useEffect } from 'react';
import useVisualViewport from '../hooks/useVisualViewport';
import KeyboardAccessory from './KeyboardAccessory';

// Shared geometry for mobile chrome and portaled pickers. No viewport meta
// zoom restriction: people can still magnify the interface when they need to.
export default function MobileViewport() {
  const viewport = useVisualViewport();
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-visual-height', `${viewport.height}px`);
    root.style.setProperty('--app-keyboard-inset', `${viewport.keyboard}px`);
    root.style.setProperty('--app-visual-bottom-inset', `${viewport.bottomInset}px`);
    root.dataset.keyboardOpen = viewport.keyboard > 120 ? 'true' : 'false';
    return () => { delete root.dataset.keyboardOpen; };
  }, [viewport]);
  return <KeyboardAccessory viewport={viewport} />;
}
