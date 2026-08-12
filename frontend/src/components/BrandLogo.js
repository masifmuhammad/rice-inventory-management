import React, { useEffect, useState } from 'react';
import { FiPackage } from 'react-icons/fi';
import { useSettings } from '../context/SettingsContext';

/**
 * The business logo, falling back to a mark when there is no image or it fails
 * to load.
 */
export default function BrandLogo({ size = 40, className = '', rounded = 'rounded-lg' }) {
  const { logo } = useSettings();
  const [failed, setFailed] = useState(!logo);

  useEffect(() => setFailed(!logo), [logo]);

  const dimensions = { width: size, height: size };

  if (!logo || failed) {
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
      src={logo}
      alt=""
      width={size}
      height={size}
      style={dimensions}
      className={`flex-shrink-0 object-contain bg-surface-1 ${rounded} ${className}`}
      onError={() => setFailed(true)}
      decoding="async"
    />
  );
}
