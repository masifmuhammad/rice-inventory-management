import { lazy } from 'react';

/**
 * After a deploy, a tab still running the old index.html requests chunk files that
 * no longer exist. The server correctly 404s them; without this wrapper the failure
 * surfaces as a blank page or a cryptic syntax error. One reload picks up the new
 * index.html and fixes it.
 */
export function lazyPage(importFn, label = 'page') {
  return lazy(() =>
    importFn().catch((error) => {
      const message = String(error?.message || error);
      const isChunkError =
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes("Unexpected token '<'");

      if (isChunkError && !sessionStorage.getItem('rim.chunk-reload')) {
        sessionStorage.setItem('rim.chunk-reload', '1');
        window.location.reload();
        return new Promise(() => {});
      }

      sessionStorage.removeItem('rim.chunk-reload');

      throw new Error(
        isChunkError
          ? 'This screen was updated in the background. Refresh the page once to load the latest version.'
          : `Could not load the ${label}. ${message}`
      );
    })
  );
}

export default lazyPage;
