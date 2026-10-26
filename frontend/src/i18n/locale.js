import baseUr from './ur.json';
import supplierUr from './suppliers.ur.json';
import reportsUr from './reports.ur.json';
import ledgerUr from './ledger.ur.json';

const ur = { ...baseUr, ...supplierUr, ...reportsUr, ...ledgerUr };

export const LANGUAGE_KEY = 'rim.language';
const supported = (value) => value === 'ur' ? 'ur' : 'en';
const readLanguage = () => { try { return supported(localStorage.getItem(LANGUAGE_KEY)); } catch { return 'en'; } };
let language = readLanguage();
const listeners = new Set();
export const getLanguage = () => language;
export const subscribeLanguage = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const publish = (next) => { language = supported(next); listeners.forEach((listener) => listener()); };
export function setLanguage(next) {
  const value = supported(next);
  try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* The choice still works in this tab. */ }
  publish(value);
}
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => { if (event.key === LANGUAGE_KEY) publish(event.newValue); });

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(ur).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const positions = [];
  const expression = key.split(/(\{\d+\})/).map((part) => {
    const match = part.match(/^\{(\d+)\}$/);
    if (!match) return escapeRegex(part);
    positions.push(Number(match[1])); return '(.+?)';
  }).join('');
  return { regex: new RegExp(`^${expression}$`), value, positions };
}).sort((a, b) => b.regex.source.length - a.regex.source.length);
const interpolate = (text, values) => text.replace(/\{(\d+)\}/g, (match, index) => String(values?.[index] ?? match));

/** Only presentation strings call this helper. API values and business data
 * remain unchanged; substitutions preserve names, quantities and identifiers. */
export function translate(value, values) {
  if (typeof value !== 'string') return value;
  if (language === 'en') return values ? interpolate(value, values) : value;
  const key = value.trim();
  if (!key) return value;
  let result = ur[key];
  if (result == null && !values) {
    for (const pattern of patterns) {
      const match = key.match(pattern.regex);
      if (!match) continue;
      const substitutions = [];
      pattern.positions.forEach((position, index) => { substitutions[position] = match[index + 1]; });
      result = interpolate(pattern.value, substitutions); break;
    }
  }
  if (result == null) result = key;
  return value.slice(0, value.indexOf(key)) + interpolate(result, values) + value.slice(value.indexOf(key) + key.length);
}
