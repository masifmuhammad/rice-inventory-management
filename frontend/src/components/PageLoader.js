import React, { useEffect, useState } from 'react';

/**
 * Fallback while a route chunk loads.
 *
 * It stays invisible for the first 250ms: on a fast connection a chunk arrives
 * in well under that, and a spinner that flashes for 80ms reads as a glitch
 * rather than as loading.
 */
export default function PageLoader({ label = 'Loading', delay = 250 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="min-h-[60vh] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={`flex flex-col items-center gap-3 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="w-8 h-8 rounded-full border-2 border-hairline/[0.12] border-t-primary-500 animate-spin motion-reduce:animate-none" />
        <span className="text-sm text-content-subtle">{label}…</span>
      </div>
    </div>
  );
}
