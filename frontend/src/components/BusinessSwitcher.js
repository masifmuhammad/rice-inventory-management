import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiChevronDown, FiLoader } from 'react-icons/fi';
import { toast } from '../utils/toast';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springSnappy, reducedTransition } from '../utils/motion';
import BrandLogo from './BrandLogo';
import { unlockFeedbackAudio, feedbackTick } from '../utils/feedback';

export default function BusinessSwitcher({ className = '', centered = false, showLogo = false }) {
  const { user, businesses, activeBusiness, businessId, switchBusiness } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  const popoverFrom = reducedMotion
    ? { opacity: 0, ...(centered ? { x: '-50%' } : {}) }
    : { opacity: 0, scale: 0.96, y: -4, ...(centered ? { x: '-50%' } : {}) };
  const popoverTo = reducedMotion
    ? { opacity: 1, ...(centered ? { x: '-50%' } : {}) }
    : { opacity: 1, scale: 1, y: 0, ...(centered ? { x: '-50%' } : {}) };
  const popoverTransition = reducedMotion ? reducedTransition : springSnappy;

  const canSwitch = user?.role === 'admin' && businesses.length > 1;

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = activeBusiness?.name || 'Business';

  const handleSwitch = async (id) => {
    if (id === businessId || switching) return;
    const next = businesses.find((b) => b.id === id);
    unlockFeedbackAudio();
    setSwitching(true);
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent('rim:business-switching', {
        detail: { businessId: id, name: next?.name || 'business' },
      })
    );

    try {
      await switchBusiness(id);
      feedbackTick();
      toast.success(`Switched to ${next?.name || 'business'}`, { feedback: 'tick' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not switch business'));
      window.dispatchEvent(new CustomEvent('rim:business-switch-cancelled'));
    } finally {
      setSwitching(false);
    }
  };

  const mark = showLogo ? <BrandLogo size={28} className="flex-shrink-0" rounded="rounded-lg" /> : null;

  if (!canSwitch) {
    return (
      <span
        className={`font-display font-semibold text-content truncate inline-flex items-center gap-2 min-w-0 text-[15px] leading-tight ${
          centered ? 'justify-center' : ''
        } ${className}`}
      >
        {mark}
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active business: ${label}. Click to switch.`}
        className={`flex items-center gap-2 max-w-full min-h-[44px] px-1.5 -mx-1 rounded-xl hover:bg-hairline/[0.05] transition-colors disabled:opacity-70 ${
          centered ? 'justify-center mx-auto' : ''
        }`}
      >
        {mark}
        <span className="font-display font-semibold text-content text-[15px] leading-tight truncate">
          {label}
        </span>
        {switching ? (
          <FiLoader className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-content-subtle" aria-hidden="true" />
        ) : (
          <FiChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-content-subtle" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Select business"
            initial={popoverFrom}
            animate={popoverTo}
            exit={popoverFrom}
            transition={popoverTransition}
            className={`absolute mt-1 w-[min(16rem,90vw)] rounded-xl border border-hairline/[0.07] bg-surface-2 shadow-lg py-1 z-50 ${
              centered ? 'left-1/2 origin-top' : 'left-0 origin-top-left'
            }`}
          >
            {businesses.map((business) => (
              <li key={business.id} role="option" aria-selected={business.id === businessId}>
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => handleSwitch(business.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm min-h-[44px] hover:bg-hairline/[0.05] ${
                    business.id === businessId
                      ? 'text-primary-600 dark:text-primary-400 font-medium'
                      : 'text-content-muted'
                  }`}
                >
                  {business.name}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
