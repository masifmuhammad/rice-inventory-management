import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';

export const readPendingLedger = (kind, userId, businessId) => {
  try { return JSON.parse(sessionStorage.getItem(`rim.pending.${kind}.${userId}.${businessId}`)) || null; } catch { return null; }
};

// Keep an uncertain financial save recoverable across dialog close and reload.
// The server commits this request ID and its result with the financial write.
export default function useLedgerSubmission(kind, onSubmit) {
  const { user, businessId } = useAuth();
  const key = `rim.pending.${kind}.${user?.id || user?._id}.${businessId}`;
  const [pending, setPending] = useState(() => readPendingLedger(kind, user?.id || user?._id, businessId));
  const current = useRef(pending);
  const working = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const persist = (next) => {
    current.current = next; setPending(next);
    try { if (next) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key); } catch { /* In-memory retry still uses the same ID. */ }
  };
  const save = async (values, draft, enabled = true) => {
    if (working.current) return;
    working.current = true; setSaving(true); setError('');
    const attempt = enabled ? current.current || { payload: { ...values, requestId: crypto.randomUUID() }, draft } : { payload: values };
    if (enabled) persist(attempt);
    try {
      await onSubmit(attempt.payload);
      if (enabled) persist(null);
      return true;
    } catch (err) {
      // A validation/permission response is definitive. Timeouts and server
      // failures can happen after commit, so confirm the same request first.
      if (err.response?.status >= 400 && err.response.status < 500 && err.response.status !== 408) persist(null);
      setError(getErrorMessage(err));
      return false;
    } finally { working.current = false; setSaving(false); }
  };
  return { save, saving, error, pending, clearError: () => setError('') };
}
