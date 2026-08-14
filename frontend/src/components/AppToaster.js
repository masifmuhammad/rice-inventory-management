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
      // The side gutters match the page's own (`px-4`). At 0.75rem the toast sat
      // 4px wider than every card under it, and two near-aligned edges read as a
      // mistake in a way one obviously different edge never would.
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)', left: '1rem', right: '1rem' }}
      // Swipe up to dismiss, matching the direction it arrived from — the same
      // spatial logic that makes a notification shade feel obvious.
      swipeDirections={isMobile ? ['top'] : ['right']}
      toastOptions={{
        classNames: {
          // Every surface in this app is borderless, opaque and 28px-cornered,
          // with depth coming from the shadow. This one was 18px, hairlined and
          // blurred, which made the one panel that appears over the page the
          // only one that didn't look like it came from here. Sonner styles the
          // element at `[data-sonner-toast][data-styled]`, so each of these has
          // to be `!` to reach it.
          toast:
            'group !rounded-card !border-0 !bg-surface-1 dark:!bg-surface-2 !text-content ' +
            // `shadow:` type hint required — without it Tailwind reads a bare
            // `var()` as a shadow *colour* and emits no box-shadow at all.
            '!shadow-[shadow:var(--toast-shadow)] !backdrop-blur-none !w-full sm:!max-w-sm !py-4 !px-5',
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
