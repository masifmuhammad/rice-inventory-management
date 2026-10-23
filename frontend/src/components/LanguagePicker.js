import React from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { FiCheck, FiGlobe } from 'react-icons/fi';
import { useAppLanguage } from '../context/LanguageContext';

export default function LanguagePicker({ fullWidth = false }) {
  const { language, setLanguage, t } = useAppLanguage();
  return <Menu as="div" className={`language-picker ${fullWidth ? 'language-picker-wide' : ''}`}>
    <MenuButton className="language-trigger" aria-label={`${t('Language')}: ${language === 'en' ? 'English' : 'اردو'}`} title={t('Change language')}>
      <FiGlobe aria-hidden="true" /><span>{language === 'en' ? 'EN' : 'اردو'}</span>
    </MenuButton>
    <MenuItems anchor="bottom end" portal className="language-menu" aria-label={t('Choose language')}>
      {[{ id: 'en', name: 'English', lang: 'en', dir: 'ltr' }, { id: 'ur', name: 'اردو', lang: 'ur', dir: 'rtl' }].map((option) => <MenuItem key={option.id}>
        <button type="button" lang={option.lang} dir={option.dir} aria-pressed={language === option.id} onClick={() => setLanguage(option.id)}>
          <span>{option.name}</span>{language === option.id && <FiCheck aria-hidden="true" />}
        </button>
      </MenuItem>)}
    </MenuItems>
  </Menu>;
}
