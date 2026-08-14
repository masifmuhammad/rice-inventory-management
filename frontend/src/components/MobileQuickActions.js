import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowDownLeft, FiDownload, FiPackage, FiTrendingUp } from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { toast } from '../utils/toast';
import { formatMoney, formatQuantity } from '../utils/currency';
import { formatSafe } from '../utils/date';
import Card from './ui/Card';
import Button from './ui/Button';

/**
 * The jobs a phone user actually opens this app to do.
 *
 * On a desktop the sidebar makes every screen one click away, so the dashboard
 * can be a summary. On a phone reaching "record a sale" means opening the tab
 * bar, landing on a list, then finding the button — and reprinting a receipt for
 * something recorded a minute ago means the same trip again. Both belong on the
 * first screen, so this sits at the top of the dashboard on mobile only.
 *
 * The create buttons navigate with the `openCreate` state the target pages
 * already handle, so no new plumbing: the form opens on arrival.
 */
export default function MobileQuickActions() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { currencySymbol, settings } = useSettings();
  const [downloadingId, setDownloadingId] = useState(null);

  // Just enough to reprint what was recorded in the last few minutes, which is
  // what this is for — the Transactions screen is still the place to go looking.
  const recent = useApi(
    (signal) =>
      api.get('/transactions', { params: { limit: 4 }, signal }).then((r) => r.data),
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

  const actions = [
    can('transactions.create') && {
      id: 'txn',
      label: 'New sale',
      icon: FiTrendingUp,
      to: '/transactions',
      variant: 'primary',
    },
    can('products.manage') && {
      id: 'product',
      label: 'Add product',
      icon: FiPackage,
      to: '/products',
      variant: 'secondary',
    },
    can('cash.manage') && {
      id: 'cash',
      label: 'Money in',
      icon: FiArrowDownLeft,
      to: '/cash-book',
      state: { openCreate: 'in' },
      variant: 'secondary',
    },
  ].filter(Boolean);

  if (!actions.length) return null;

  const list = recent.data?.data || [];

  return (
    <div className="lg:hidden space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((action, index) => (
          <Button
            key={action.id}
            variant={action.variant}
            icon={action.icon}
            fullWidth
            // The primary action gets the full width above the other two, so the
            // thing done fifty times a day is not the same size as the rest.
            className={`${index === 0 ? 'col-span-2 min-h-[52px] text-base' : ''} justify-start`}
            onClick={() => navigate(action.to, { state: action.state || { openCreate: true } })}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-sm font-semibold text-content">Just recorded</h2>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 min-h-[44px] px-2 -mr-2"
            >
              See all
            </button>
          </div>

          <ul className="divide-y divide-hairline">
            {list.map((transaction) => (
              <li key={transaction._id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content truncate">
                    {transaction.product?.name || 'Deleted product'}
                  </p>
                  <p className="text-xs text-content-subtle tabular-nums truncate">
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
