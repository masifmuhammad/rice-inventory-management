import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initTheme } from './context/ThemeContext';
import { toast } from './utils/toast';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

initTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Never register a service worker during `npm start` — it breaks login after
// Docker rebuilds. Production Docker builds still register.
if (process.env.NODE_ENV === 'production') {
  serviceWorkerRegistration.register({
    /**
     * A new build is installed and waiting. The worker no longer claims open
     * tabs on its own, so the swap happens here, when the user says so —
     * activating under someone mid-form would evict the chunk files the running
     * page still needs and break the next lazy route they open.
     */
    onUpdate: (registration) => {
      const waiting = registration.waiting;
      if (!waiting) return;

      toast('A new version is ready', {
        duration: Infinity,
        action: {
          label: 'Reload',
          onClick: () => {
            waiting.addEventListener('statechange', (event) => {
              if (event.target.state === 'activated') window.location.reload();
            });
            waiting.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    },
  });
} else {
  serviceWorkerRegistration.unregister();
}
