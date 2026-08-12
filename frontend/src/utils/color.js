/**
 * Theme colours live as CSS custom properties holding raw RGB channels
 * ("2 132 199"), which is what lets Tailwind's `/50` opacity modifiers keep
 * working against a runtime-configurable brand colour.
 */

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

export const hexToRgb = (hex) => {
  const value = String(hex || '').replace('#', '').trim();
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

/** Mixes toward white (amount > 0) or black (amount < 0). */
const mix = ({ r, g, b }, amount) => {
  const target = amount > 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return {
    r: clamp(r + (target - r) * ratio),
    g: clamp(g + (target - g) * ratio),
    b: clamp(b + (target - b) * ratio),
  };
};

// Roughly matches the spacing of Tailwind's own palettes, with 600 as the anchor.
const STEPS = {
  50: 0.95,
  100: 0.88,
  200: 0.74,
  300: 0.56,
  400: 0.32,
  500: 0.14,
  600: 0,
  700: -0.18,
  800: -0.34,
  900: -0.5,
};

const channels = ({ r, g, b }) => `${r} ${g} ${b}`;

/** Builds a full 50–900 ramp from a single brand colour. */
export const buildPalette = (hex) => {
  const base = hexToRgb(hex);
  if (!base) return null;

  return Object.entries(STEPS).reduce((palette, [shade, amount]) => {
    palette[shade] = channels(amount === 0 ? base : mix(base, amount));
    return palette;
  }, {});
};

export const applyPalette = (hex) => {
  let effectiveHex = hex;
  let palette = buildPalette(hex);
  if (!palette || typeof document === 'undefined') return false;

  const base = hexToRgb(hex);
  if (base) {
    const luminance = (0.299 * base.r + 0.587 * base.g + 0.114 * base.b) / 255;
    if (luminance > 0.85) {
      effectiveHex = '#059669';
      palette = buildPalette(effectiveHex);
    }
  }

  const root = document.documentElement;
  Object.entries(palette).forEach(([shade, value]) => {
    root.style.setProperty(`--color-primary-${shade}`, value);
  });

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveHex);

  return true;
};

/** Picks black or white text for a background, using perceived luminance. */
export const readableTextOn = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
};

const USER_AVATAR_PALETTES = [
  { bg: 'bg-primary-500/15', text: 'text-primary-600 dark:text-primary-400', ring: 'ring-primary-500/25', stripe: 'bg-primary-500' },
  { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/25', stripe: 'bg-violet-500' },
  { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/25', stripe: 'bg-amber-500' },
  { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/25', stripe: 'bg-rose-500' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/25', stripe: 'bg-cyan-500' },
  { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/25', stripe: 'bg-orange-500' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/25', stripe: 'bg-emerald-500' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600 dark:text-fuchsia-400', ring: 'ring-fuchsia-500/25', stripe: 'bg-fuchsia-500' },
];

const hashString = (value) => {
  const seed = String(value || '?').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/** Stable avatar colours per user — same person always gets the same palette. */
export const userAvatarPalette = (key) =>
  USER_AVATAR_PALETTES[hashString(key) % USER_AVATAR_PALETTES.length];
