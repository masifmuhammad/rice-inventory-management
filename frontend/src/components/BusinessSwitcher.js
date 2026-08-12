import React, { useEffect, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';

export default function BusinessSwitcher({ className = '', centered = false }) {
  const { user, businesses, activeBusiness, businessId, switchBusiness } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

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
    setSwitching(true);
    try {
      await switchBusiness(id);
      toast.success('Switched business');
      setOpen(false);
      window.location.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not switch business'));
    } finally {
      setSwitching(false);
    }
  };

  if (!canSwitch) {
    return (
      <span
        className={`font-display font-semibold text-content truncate inline-flex items-center min-w-0 ${
          centered ? 'justify-center' : ''
        } ${className}`}
      >
        {label}
      </span>
    );
  }

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active business: ${label}. Click to switch.`}
        className={`flex items-center gap-1 max-w-full min-h-[44px] px-1 rounded-lg hover:bg-hairline/[0.05] transition-colors ${
          centered ? 'justify-center mx-auto' : ''
        }`}
      >
        <span className="font-display font-semibold text-content truncate">{label}</span>
        <FiChevronDown className="w-4 h-4 flex-shrink-0 text-content-subtle" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select business"
          className="absolute left-1/2 -translate-x-1/2 mt-1 w-[min(16rem,90vw)] rounded-xl border border-hairline/[0.07] bg-surface-1 shadow-lg py-1 z-50"
        >
          {businesses.map((business) => (
            <li key={business.id} role="option" aria-selected={business.id === businessId}>
              <button
                type="button"
                disabled={switching}
                onClick={() => handleSwitch(business.id)}
                className={`w-full text-left px-4 py-2.5 text-sm min-h-[44px] hover:bg-hairline/[0.05] ${
                  business.id === businessId ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-content-muted'
                }`}
              >
                {business.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
