import React from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '../context/ThemeContext';

export default function AppToaster() {
  const { resolved } = useTheme();

  return (
    <Toaster
      theme={resolved}
      position="top-right"
      closeButton
      offset={{ top: '3.75rem' }}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-well !bg-surface-1 !text-content !border !border-hairline/[0.1] ' +
            '!shadow-lg !text-sm !max-w-sm !backdrop-blur-xl',
          title: '!text-sm !font-medium !text-content',
          description: '!text-xs !text-content-muted',
          actionButton: '!bg-primary-600 !text-white !rounded-lg',
          cancelButton: '!bg-hairline/[0.08] !text-content-muted !rounded-lg',
          closeButton:
            '!bg-surface-3 !text-content-muted !border-hairline/[0.1] hover:!text-content',
          success: '!text-content',
          error: '!text-content',
        },
      }}
    />
  );
}
