import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiAlertCircle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiChevronRight,
  FiDownload,
  FiPackage,
  FiTrendingUp,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useActionUsage from '../hooks/useActionUsage';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { toast } from '../utils/toast';
import { formatMoney, formatQuantity } from '../utils/currency';
import Button from './ui/Button';

/** Strong ease-out — the stock curves do not read as deliberate. */
const EASE_OUT = [0.23, 1, 0.32, 1];

/**
 * The top of the home screen on a phone: what to do, what needs attention, and
 * what was last done — in that order, because that is the order they are needed.
 *
 * A dashboard on a desktop can afford to lead with figures, because the sidebar
 * puts every screen one click away. On a phone the tab bar holds four things and
 * everything else is behind a drawer, so leading with a summary means the work
 * always starts with navigation.
 */
export default function MobileQuickActions({ lowStock = [], lowStockCount = 0 }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { currencySymbol, settings } = useSettings();
  const { record, order } = useActionUsage();
  const reducedMotion = usePrefersReducedMotion();
  const [downloading, setDownloading] = useState(false);

  // Only the last one. This is a shortcut to reprinting what was just recorded,
  // not a second copy of the transactions list.
  const recent = useApi(
    (signal) => api.get('/transactions', { params: { limit: 1 }, signal }).then((r) => r.data),
    [],
    { keepPreviousData: true }
  );

  const last = recent.data?.data?.[0] || null;

  const handleReceipt = useCallback(async () => {
    if (!last?.product) {
      toast.error('This transaction has no product attached.');
      return;
    }

    setDownloading(true);
    try {
      const { generateTransactionPDF } = await import('../utils/pdfGenerator');
      const outcome = await generateTransactionPDF(last, last.product, settings);

      if (outcome === 'cancelled') toast.dismiss();
      else if (outcome === 'shared')
        toast.success('Receipt ready — choose "Save to Files" to keep it', { feedback: 'download' });
      else if (outcome === 'insecure')
        toast.error('Open the app over https to save files on iPhone');
      else toast.success('Receipt downloaded', { feedback: 'download' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not build the receipt'));
    } finally {
      setDownloading(false);
    }
  }, [last, settings]);

  const available = [
    can('transactions.create') && {
      id: 'sale',
      label: 'Record sale',
      icon: FiTrendingUp,
      to: '/transactions',
      state: { openCreate: true },
    },
    can('transactions.create') && {
      id: 'stock-in',
      label: 'Stock in',
      icon: FiPackage,
      to: '/transactions',
      state: { openCreate: true },
    },
    can('cash.manage') && {
      id: 'cash-in',
      label: 'Money in',
      icon: FiArrowDownLeft,
      to: '/cash-book',
      state: { openCreate: 'in' },
    },
    can('cash.manage') && {
      id: 'cash-out',
      label: 'Money out',
      icon: FiArrowUpRight,
      to: '/cash-book',
      state: { openCreate: 'out' },
    },
  ].filter(Boolean);

  if (!available.length) return null;

  /**
   * The first action never moves.
   *
   * Reordering it by usage was the wrong call: this is a tool people operate by
   * muscle memory dozens of times a day, and a primary button that relocates
   * makes them look before every tap — which costs more than the ordering ever
   * saved. The three secondary actions still sort by use, where being wrong
   * costs a glance rather than a mis-tap.
   */
  const [primary, ...secondary] = available;
  const rest = order(secondary);

  const go = (action) => {
    record(action.id);
    navigate(action.to, { state: action.state });
  };

  /**
   * Something is actually out of stock, not merely near the reorder point.
   * That is the difference between a note and an interruption: you cannot sell
   * what you do not have, so it goes above the actions. A low-but-present
   * product is worth knowing and can wait its turn below them.
   */
  const outOfStock = lowStock.filter((p) => Number(p.currentStock) <= 0).length;
  const urgent = outOfStock > 0;

  // Entrances start from a visible offset, never from nothing — an element that
  // materialises out of zero reads as a glitch rather than an arrival.
  const rise = (delay) =>
    reducedMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
      : {
          initial: { opacity: 0, transform: 'translateY(8px)' },
          animate: { opacity: 1, transform: 'translateY(0px)' },
          transition: { duration: 0.26, ease: EASE_OUT, delay },
        };

  /* Rendered only when there is something to act on — a panel that permanently
     says "all good" trains people to stop reading it. */
  const attention = lowStockCount > 0 && (
        <motion.button
          type="button"
          {...rise(0.04)}
          onClick={() => navigate('/products', { state: { lowStockOnly: true } })}
          className={`w-full flex items-center gap-3 rounded-card px-4 py-3 text-left
            active:scale-[0.96] transition-transform duration-150 ease-out
            motion-reduce:active:scale-100 ${
              urgent
                ? 'bg-red-500/[0.09] shadow-[inset_0_0_0_1px_rgb(239_68_68/0.28)]'
                : 'bg-amber-500/[0.08] shadow-[inset_0_0_0_1px_rgb(245_158_11/0.22)]'
            }`}
        >
          <FiAlertCircle
            className={`w-5 h-5 flex-shrink-0 ${urgent ? 'text-red-500' : 'text-amber-500'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-content">
              {urgent
                ? `${outOfStock} ${outOfStock === 1 ? 'product is' : 'products are'} out of stock`
                : `${lowStockCount} ${lowStockCount === 1 ? 'product is' : 'products are'} running low`}
            </span>
            <span className="block text-[13px] text-content-subtle truncate tabular-nums">
              {lowStock
                .slice(0, 2)
                .map((p) => `${p.name} · ${formatQuantity(p.currentStock, p.unit)}`)
                .join(' · ') || 'Tap to review'}
            </span>
          </span>
          <FiChevronRight className="w-4 h-4 flex-shrink-0 text-content-subtle" aria-hidden="true" />
        </motion.button>
  );

  return (
    <div className="lg:hidden space-y-2.5">
      {urgent && attention}

      {/* The most-used action gets its own row. The thing done fifty times a day
          should not be the same size as the thing done weekly. */}
      <Button
        variant="primary"
        icon={primary.icon}
        fullWidth
        className="min-h-[54px] text-base justify-center"
        onClick={() => go(primary)}
      >
        {primary.label}
      </Button>

      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {rest.map((action) => (
            <Button
              key={action.id}
              variant="secondary"
              icon={action.icon}
              className="min-h-[46px] flex-col gap-1 !text-[13px] px-1"
              onClick={() => go(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {!urgent && attention}

      {/* Last recorded, as one line. The full list lives on Transactions; this
          exists so a receipt for what was just entered is one tap away. */}
      <LastRecordedCapsule
        transaction={last}
        currencySymbol={currencySymbol}
        downloading={downloading}
        onReceipt={handleReceipt}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}

/** Past this the release counts as a dismissal rather than a stray nudge. */
const DISMISS = 88;

/**
 * The last recorded entry, as one dismissible line.
 *
 * Keyed by transaction id at the call site rather than animating on every
 * render: the parent re-renders whenever any of its queries settle, and an
 * entrance tied to render is what made this flicker. It animates when the
 * *entry* changes and stays still otherwise.
 *
 * Dismissing is per entry and remembered, so a capsule swiped away does not
 * reappear on the next refetch — the whole point of dismissing it.
 */
function LastRecordedCapsule({ transaction, currencySymbol, downloading, onReceipt, reducedMotion }) {
  const [dismissed, setDismissed] = useState(null);

  if (!transaction || dismissed === transaction._id) return null;

  const isOut = transaction.type === 'stock_out';

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={transaction._id}
        layout={!reducedMotion}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
        transition={{ duration: 0.26, ease: EASE_OUT }}
        drag={reducedMotion ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        dragSnapToOrigin
        onDragEnd={(event, info) => {
          // A flick counts even if it did not travel far — the same rule the
          // platform uses for dismissing its own notifications.
          const flicked = Math.abs(info.velocity.x) > 420;
          if (Math.abs(info.offset.x) > DISMISS || flicked) setDismissed(transaction._id);
        }}
        className="touch-pan-y"
      >
        <button
          type="button"
          onClick={onReceipt}
          disabled={downloading}
          aria-label={`Receipt for ${transaction.product?.name || 'the last transaction'}`}
          className="w-full flex items-center gap-2.5 rounded-full pl-4 pr-2 py-2
            surface-card text-left
            active:scale-[0.96] transition-transform duration-150 ease-out
            motion-reduce:active:scale-100 disabled:opacity-60"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isOut ? 'bg-red-500' : 'bg-emerald-500'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[14px] text-content-muted tabular-nums">
            <span className="font-medium text-content">
              {transaction.product?.name || 'Last entry'}
            </span>
            {' · '}
            {formatQuantity(transaction.quantity, transaction.unit)}
            {transaction.totalValue > 0
              ? ` · ${formatMoney(transaction.totalValue, currencySymbol)}`
              : ''}
          </span>
          <span className="grid place-items-center w-9 h-9 rounded-full bg-hairline/[0.06] flex-shrink-0">
            <FiDownload
              className={`w-4 h-4 text-content-muted ${downloading ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
          </span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
