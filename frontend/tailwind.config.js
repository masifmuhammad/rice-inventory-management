/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

// The primary ramp reads from CSS variables so a business can set its own brand
// colour at runtime. `<alpha-value>` keeps opacity modifiers (`bg-primary-600/20`)
// working against those variables.
const primary = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => [
    shade,
    `rgb(var(--color-primary-${shade}) / <alpha-value>)`,
  ])
);

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        // Tailwind's default gray is blue-tinted; neutral reads warmer and more premium.
        gray: colors.neutral,
        primary,
        // Semantic tokens flip with `.dark`, so a component styled once is
        // correct in both themes without any `dark:` variants.
        surface: {
          base: 'rgb(var(--surface-base) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        content: {
          DEFAULT: 'rgb(var(--content) / <alpha-value>)',
          muted: 'rgb(var(--content-muted) / <alpha-value>)',
          subtle: 'rgb(var(--content-subtle) / <alpha-value>)',
        },
      },
      borderRadius: {
        // Measured off the reference: cards 28px, panels nested in them 20px.
        card: '28px',
        well: '20px',
        pill: '12px',
      },
      fontFamily: {
        sans: [
          'Inter Tight',
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // The reference sets headings and figures in the same face as the UI.
        display: [
          'Inter Tight',
          'Inter var',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        // Nastaliq for Urdu body copy — pair with generous line-height in CSS.
        urdu: [
          '"Noto Nastaliq Urdu"',
          '"Noto Naskh Arabic"',
          '"Segoe UI"',
          'Tahoma',
          'sans-serif',
        ],
      },
      /**
       * The reference's type scale, measured from cap heights in the mock. Each
       * token carries its own tracking because the correction is size-dependent:
       * display sizes need it pulled in hard, 13px body text needs none at all.
       */
      fontSize: {
        figure: ['3rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '600' }],
        title: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.022em', fontWeight: '600' }],
        heading: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.016em', fontWeight: '600' }],
        subhead: ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.014em', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.55', letterSpacing: '-0.011em' }],
        caption: ['0.8125rem', { lineHeight: '1.45', letterSpacing: '-0.005em' }],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-up': 'fade-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      transitionTimingFunction: {
        // A gentle overshoot-free ease that suits UI more than the default.
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
