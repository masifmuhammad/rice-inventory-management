import React from 'react';
import { AssistantProvider } from '../../context/AssistantContext';
import AssistantFab from './AssistantFab';

/** AI UI loaded separately so the dashboard and core pages are unaffected. */
export default function AssistantShell() {
  return (
    <AssistantProvider>
      <AssistantFab />
    </AssistantProvider>
  );
}
