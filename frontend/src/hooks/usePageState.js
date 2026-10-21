import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Retain list filters within this tab while moving between screens. Never store
// form drafts, passwords or API data here. A business switch remounts its pages.
const values = new Map();
export default function usePageState(key, initial) {
  const { user, businessId } = useAuth();
  const scoped = JSON.stringify([user?.id || user?._id, businessId, key]);
  const [value, setValue] = useState(() => values.has(scoped) ? values.get(scoped) : typeof initial === 'function' ? initial() : initial);
  useEffect(() => {
    values.delete(scoped);
    values.set(scoped, value);
    if (values.size > 160) values.delete(values.keys().next().value);
  }, [scoped, value]);
  return [value, setValue];
}
