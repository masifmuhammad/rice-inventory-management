const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    if (isLocalhost) {
      checkValidServiceWorker(swUrl, config);
      navigator.serviceWorker.ready.then(() => {
        console.info('PWA service worker ready (dev).');
      });
      return;
    }

    registerValidSW(swUrl, config);
  });
}

/**
 * Ask the browser to look for a new build.
 *
 * A service worker only checks for an update on navigation. An installed PWA on
 * an iPhone home screen is almost never navigated — it is opened, backgrounded,
 * and opened again for weeks — so without this a deploy can sit unnoticed
 * indefinitely and there is no address bar to reload from. Checking whenever the
 * app comes back to the foreground is what makes "I pushed an update" actually
 * reach the device.
 */
function watchForUpdates(registration) {
  const check = () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // Also on a long-lived session that never gets backgrounded.
  setInterval(check, 60 * 60 * 1000);

  // Pull-to-refresh doubles as "get me the latest" — the gesture users already
  // reach for when something looks stale.
  window.addEventListener('rim:refresh', check);
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      watchForUpdates(registration);

      // A build that finished installing while the app was backgrounded is
      // already sitting in `waiting`, and `onupdatefound` has long since fired
      // for it — so without this the prompt never appears and the update stalls
      // one tap away from being applied, forever.
      if (registration.waiting && navigator.serviceWorker.controller) {
        config?.onUpdate?.(registration);
      }

      registration.onupdatefound = () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.onstatechange = () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            config?.onUpdate?.(registration);
          } else if (installing.state === 'installed') {
            config?.onSuccess?.(registration);
          }
        };
      };
    })
    .catch((error) => {
      console.error('Service worker registration failed:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      if (response.status === 404 || !response.headers.get('content-type')?.includes('javascript')) {
        navigator.serviceWorker.ready.then((registration) => registration.unregister());
        return;
      }
      registerValidSW(swUrl, config);
    })
    .catch(() => {
      console.info('No internet connection. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => registration.unregister());
  }
}
