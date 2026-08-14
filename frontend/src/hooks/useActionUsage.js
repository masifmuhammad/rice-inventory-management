import { useCallback, useMemo, useState } from 'react';

const KEY = 'rim.action-usage';

/**
 * How often each shortcut gets used, so the ones that matter rise to the top.
 *
 * Counts are weighted toward recent behaviour rather than kept as a running
 * total: a raw tally lets the first busy week decide the order forever, so
 * someone who moves from receiving stock to recording sales would keep being
 * shown the wrong button for months. Every record decays the existing counts a
 * little, which means the order follows what the person is doing *now* and an
 * abandoned habit fades out on its own.
 *
 * Per device and never sent anywhere — it is a preference, not analytics.
 */
const DECAY = 0.98;
/** Below this a count is noise from a stray tap, so it is dropped entirely. */
const FLOOR = 0.05;

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export default function useActionUsage() {
  const [counts, setCounts] = useState(read);

  const record = useCallback((id) => {
    setCounts((current) => {
      const next = {};
      for (const [key, value] of Object.entries(current)) {
        const decayed = value * DECAY;
        if (decayed > FLOOR) next[key] = decayed;
      }
      next[id] = (next[id] || 0) + 1;

      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage disabled — ordering just resets next visit */
      }
      return next;
    });
  }, []);

  /**
   * Orders `items` by use, keeping the given order as the tie-break so an
   * untouched app is not in an arbitrary sequence — and so two rarely-used
   * actions do not swap places over a single tap.
   */
  const order = useCallback(
    (items) =>
      items
        .map((item, index) => ({ item, index, score: counts[item.id] || 0 }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ item }) => item),
    [counts]
  );

  return useMemo(() => ({ record, order }), [record, order]);
}
