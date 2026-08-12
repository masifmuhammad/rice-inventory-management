import React from 'react';
import { userAvatarPalette } from '../utils/color';

const SIZES = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-20 h-20 text-2xl',
  xl: 'w-24 h-24 text-3xl',
};

export default function UserAvatar({ name, avatar, size = 'sm', colorKey, className = '' }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const sizeClass = SIZES[size] || SIZES.sm;
  const palette = userAvatarPalette(colorKey || name);

  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        className={`rounded-full object-cover flex-shrink-0 ring-2 ${palette.ring} ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      className={`rounded-full ${palette.bg} ${palette.text} flex items-center justify-center font-semibold flex-shrink-0 ring-2 ${palette.ring} ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
