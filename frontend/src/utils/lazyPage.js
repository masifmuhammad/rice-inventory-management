import { lazy } from 'react';

const CHUNK_RELOAD_KEY = 'rim.chunk-reload';

const isChunkError = (message) =>
  message.includes('Loading chunk') ||
  message.includes('ChunkLoadError') ||
  message.includes("Unexpected token '<'");

/** Drop cached shells and chunks so a deploy cannot trap the tab on a stale index.html. */
const clearPwaCaches = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
};

const withTimeout = (promise, ms, label) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
        ms
      );
    }),
    // `Promise.race` discards the loser but not its timer, which would otherwise
    // hold the closure alive for 45s after every successful chunk load.
  ]).finally(() => clearTimeout(timer));
};

/**
 * After a deploy, a tab still running the old index.html requests chunk files that
 * no longer exist. The server correctly 404s them; without this wrapper the failure
 * surfaces as a blank page or a cryptic syntax error. One reload picks up the new
 * index.html and fixes it.
 */
export function lazyPage(importFn, label = 'page') {
  return lazy(() =>
    withTimeout(importFn(), 45000, `Loading ${label}`)
      .then((module) => {
        // A successful load means this tab is on a current build, so the
        // one-reload budget is free again. Leaving the flag set meant the
        // *second* deploy of a long-lived session skipped the auto-recovery
        // and dropped the user on the error screen instead.
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* storage disabled — the guard just stays as it is */
        }
        return module;
      })
      .catch(async (error) => {
        const message = String(error?.message || error);

        if (isChunkError(message) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          await clearPwaCaches().catch(() => {});
          window.location.reload();
          return new Promise(() => {});
        }

        sessionStorage.removeItem(CHUNK_RELOAD_KEY);

        throw new Error(
          isChunkError(message)
            ? 'This screen was updated in the background. Refresh the page once to load the latest version.'
            : `Could not load the ${label}. ${message}`
        );
      })
  );
}

export default lazyPage;
