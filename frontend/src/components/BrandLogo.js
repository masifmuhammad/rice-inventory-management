import React, { useEffect, useState } from 'react';
import { FiPackage } from 'react-icons/fi';
import { useSettings } from '../context/SettingsContext';

const DEFAULT_BRAND_LOGO = `${process.env.PUBLIC_URL || ''}/brand/hm-logo.png`;

/**
 * Always show the Haji Muhammad mark unless a business uploaded its own logo.
 * Falls back to the bundled brand asset (not the generic package icon).
 */
export default function BrandLogo({ size = 40, className = '', rounded = 'rounded-lg' }) {
  const { logo } = useSettings();
  // Prefer uploaded logo only when it looks like a real image data URL / path.
  const src = logo || DEFAULT_BRAND_LOGO;
  const [failed, setFailed] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState(null);

  useEffect(() => {
    setFailed(false);
    setFallbackSrc(null);
  }, [src]);

  const dimensions = { width: size, height: size };
  const displaySrc = fallbackSrc || src;

  if (failed && !fallbackSrc) {
    return (
      <span
        style={dimensions}
        className={`flex-shrink-0 flex items-center justify-center bg-primary-500/12 text-primary-600 dark:text-primary-400 ${rounded} ${className}`}
      >
        <FiPackage style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={displaySrc}
      alt="Haji Muhammad Rice Mills"
      width={size}
      height={size}
      style={dimensions}
      className={`flex-shrink-0 object-contain bg-white ${rounded} ${className}`}
      onError={() => {
        if (displaySrc !== DEFAULT_BRAND_LOGO) {
          setFallbackSrc(DEFAULT_BRAND_LOGO);
          return;
        }
        setFailed(true);
      }}
      decoding="async"
    />
  );
}
