import React, { useEffect, useSyncExternalStore } from 'react';
import { getLanguage, setLanguage, subscribeLanguage, translate } from '../i18n/locale';
export { translate } from '../i18n/locale';

export function useAppLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en');
  return { language, setLanguage, t: translate, isUrdu: language === 'ur' };
}
export function LanguageProvider({ children }) {
  const { language, isUrdu } = useAppLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isUrdu ? 'rtl' : 'ltr';
    document.documentElement.dataset.language = language;
    if (isUrdu) import('@fontsource/noto-sans-arabic/arabic-400.css');
    if (isUrdu) import('@fontsource/noto-sans-arabic/arabic-600.css');
  }, [language, isUrdu]);
  return <>{children}</>;
}
