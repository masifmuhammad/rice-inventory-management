import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initTheme } from './context/ThemeContext';
import { FiArrowUpCircle } from 'react-icons/fi';
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

      /**
       * A custom toast rather than the default title-plus-action row.
       *
       * The stock version put a green button hard against the text with nothing
       * explaining what reloading costs, which on a form-heavy app is a fair
       * thing to hesitate over. This says what it is, what it does, and leaves
       * an obvious way to not do it yet.
       */
      toast.custom(
        (id) => (
          <div className="flex items-start gap-3 w-full">
            <span
              aria-hidden="true"
              className="grid place-items-center w-9 h-9 rounded-full flex-shrink-0
                bg-primary-500/12 text-primary-600 dark:text-primary-400"
            >
              <FiArrowUpCircle className="w-5 h-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-content leading-snug">Update available</p>
              <p className="text-[13px] text-content-muted leading-snug mt-0.5">
                Reload to get the latest version. Anything you are part-way through will be lost.
              </p>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    waiting.addEventListener('statechange', (event) => {
                      if (event.target.state === 'activated') window.location.reload();
                    });
                    waiting.postMessage({ type: 'SKIP_WAITING' });
                  }}
                  className="min-h-[36px] px-3.5 rounded-lg bg-primary-600 text-white
                    text-[13px] font-semibold active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Reload now
                </button>
                <button
                  type="button"
                  onClick={() => toast.dismiss(id)}
                  className="min-h-[36px] px-3 rounded-lg text-[13px] font-medium text-content-muted
                    active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        ),
        // It waits rather than nagging: the update applies on the next launch
        // regardless, so there is no deadline to enforce here.
        { duration: Infinity }
      );
    },
  });
} else {
  serviceWorkerRegistration.unregister();
}
