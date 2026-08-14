import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiDownload,
  FiPackage,
  FiTrendingUp,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useActionUsage from '../hooks/useActionUsage';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { toast } from '../utils/toast';
import { formatMoney, formatQuantity } from '../utils/currency';
import { formatSafe } from '../utils/date';
import Card from './ui/Card';
import Button from './ui/Button';

/**
 * The top of the home screen on a phone.
 *
 * A dashboard on a desktop can afford to be a summary, because the sidebar puts
 * every screen one click away. On a phone the sidebar is a drawer and the tab
 * bar only holds four things, so a summary-first home screen means the work
 * always starts with navigation. This puts the jobs first and the figures below.
 *
 * The shortcuts reorder themselves by use — someone recording forty sales a day
 * should not have the same first button as someone who mostly receives
 * deliveries. Ordering is per device and decays, so it follows current habit
 * rather than being fixed by whatever the first busy week looked like.
 */
export default function MobileQuickActions() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { currencySymbol, settings } = useSettings();
  const { record, order } = useActionUsage();
  const [downloadingId, setDownloadingId] = useState(null);

  // Enough to reprint what was recorded in the last few minutes, which is what
  // this is for — Transactions is still where you go to look something up.
  const recent = useApi(
    (signal) => api.get('/transactions', { params: { limit: 4 }, signal }).then((r) => r.data),
    [],
    { keepPreviousData: true }
  );

  const handleReceipt = useCallback(
    async (transaction) => {
      if (!transaction.product) {
        toast.error('This transaction has no product attached.');
        return;
      }

      setDownloadingId(transaction._id);
      try {
        const { generateTransactionPDF } = await import('../utils/pdfGenerator');
        const outcome = await generateTransactionPDF(transaction, transaction.product, settings);

        if (outcome === 'cancelled') toast.dismiss();
        else if (outcome === 'shared')
          toast.success('Receipt ready — choose "Save to Files" to keep it', { feedback: 'download' });
        else if (outcome === 'insecure')
          toast.error('Open the app over https to save files on iPhone');
        else toast.success('Receipt downloaded', { feedback: 'download' });
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not build the receipt'));
      } finally {
        setDownloadingId(null);
      }
    },
    [settings]
  );

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

  const ranked = order(available);
  const [primary, ...rest] = ranked;

  const go = (action) => {
    record(action.id);
    navigate(action.to, { state: action.state });
  };

  const list = recent.data?.data || [];

  return (
    <div className="lg:hidden space-y-3">
      {/* The most-used action gets its own full-width row. The thing done fifty
          times a day should not be the same size as the thing done weekly. */}
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

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-base font-semibold text-content">Just recorded</h2>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 min-h-[44px] px-2 -mr-2"
            >
              See all
            </button>
          </div>

          <ul className="divide-y divide-hairline">
            {list.map((transaction) => (
              <li key={transaction._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-content truncate">
                    {transaction.product?.name || 'Deleted product'}
                  </p>
                  <p className="text-[13px] text-content-subtle tabular-nums truncate">
                    {formatQuantity(transaction.quantity, transaction.unit)}
                    {transaction.totalValue > 0
                      ? ` · ${formatMoney(transaction.totalValue, currencySymbol)}`
                      : ''}
                    {' · '}
                    {formatSafe(transaction.createdAt, 'd MMM, h:mm a', '')}
                  </p>
                </div>

                <Button
                  size="icon"
                  variant="secondary"
                  icon={FiDownload}
                  aria-label={`Receipt for ${transaction.product?.name || 'transaction'}`}
                  loading={downloadingId === transaction._id}
                  onClick={() => handleReceipt(transaction)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
