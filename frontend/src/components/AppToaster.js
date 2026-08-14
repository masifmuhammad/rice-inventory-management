import React from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import useMediaQuery from '../hooks/useMediaQuery';

/**
 * Where a message appears is most of whether it feels native.
 *
 * On a phone, system notifications come down from the top edge, centred and
 * near full width. A small card pinned to the top *right* is a desktop
 * convention, and at 390px wide it crowds one corner while leaving the rest of
 * the bar empty. Centred and wide reads as the platform's own.
 *
 * The offset is safe-area aware in both directions. The previous flat 3.75rem
 * assumed a header height and no notch, so in standalone on an iPhone the toast
 * landed under the status bar.
 */
export default function AppToaster() {
  const { resolved } = useTheme();
  const isMobile = useMediaQuery('(max-width: 640px)');

  return (
    <Toaster
      theme={resolved}
      position={isMobile ? 'top-center' : 'top-right'}
      closeButton={!isMobile}
      // Desktop clears the header; mobile clears the notch and then some, so the
      // toast sits below the status bar rather than fighting it.
      offset={{ top: '3.75rem' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)', left: '0.75rem', right: '0.75rem' }}
      // Swipe up to dismiss, matching the direction it arrived from — the same
      // spatial logic that makes a notification shade feel obvious.
      swipeDirections={isMobile ? ['top'] : ['right']}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-[18px] !bg-surface-1 !text-content !border !border-hairline/[0.1] ' +
            '!shadow-2xl !w-full sm:!max-w-sm !backdrop-blur-xl !py-3.5 !px-4',
          // A notification the user has half a second to read should not be set
          // smaller than the page behind it.
          title: '!text-[15px] !font-semibold !text-content !leading-snug',
          description: '!text-[13px] !text-content-muted !leading-snug !mt-0.5',
          actionButton: '!bg-primary-600 !text-white !rounded-lg !text-[13px] !font-medium !px-3 !py-1.5',
          cancelButton: '!bg-hairline/[0.08] !text-content-muted !rounded-lg !text-[13px]',
          closeButton:
            '!bg-surface-3 !text-content-muted !border-hairline/[0.1] hover:!text-content',
          success: '!text-content',
          error: '!text-content',
        },
      }}
    />
  );
}
