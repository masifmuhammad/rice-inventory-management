/**
 * Saving a generated file from the browser.
 *
 * `<a download>` is the obvious route and it is the wrong one on iOS. WebKit
 * ignores the `download` attribute, so a blob URL is *navigated to* rather than
 * saved: the PDF opens as a page, the user is left looking at a viewer with no
 * obvious way back, and nothing lands in Files. In a standalone PWA it is worse
 * still — the navigation can replace the app itself.
 *
 * The share sheet is the only path on iOS that reaches "Save to Files", so that
 * is what iOS gets. Everywhere else keeps the ordinary download, which puts the
 * file straight into the Downloads folder without an extra tap.
 */

/** iOS, including iPadOS 13+ which reports itself as a Mac. */
const isAppleTouchDevice = () => {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;

  // iPadOS 13+ claims to be macOS; a touch-capable "Mac" is an iPad.
  return /Macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
};

/**
 * The Web Share API is gated on a secure context.
 *
 * Over plain http:// — which is how this app was served before TLS — both
 * `navigator.share` and `navigator.canShare` are simply undefined. The share
 * path then silently falls through to `<a download>`, which iOS ignores, and the
 * user gets the PDF opened as a page with no way to save it. That is a
 * deployment problem wearing a download bug's clothes, so it is worth naming
 * rather than degrading quietly.
 */
const isSecure = () => typeof window !== 'undefined' && window.isSecureContext;

const canShareFile = (file) => {
  try {
    return Boolean(navigator.canShare?.({ files: [file] }) && navigator.share);
  } catch {
    return false;
  }
};

/** Classic anchor download. Returns false when the browser refuses to save. */
const downloadViaAnchor = (blob, filename) => {
  const anchor = document.createElement('a');
  if (!('download' in anchor)) return false;

  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoking immediately can cancel the download in Firefox and older WebKit.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};

/**
 * Saves a Blob under `filename`.
 *
 * @returns 'saved' | 'shared' | 'cancelled' | 'opened' | 'insecure'
 *   'cancelled' means the user dismissed the share sheet — not an error, and the
 *   caller should not show a failure toast for it.
 *   'insecure' means an iPhone was served over plain http, so the only route to
 *   Files was unavailable. The caller should say so, because the fix is to open
 *   the site over https rather than anything the user can do on this screen.
 */
export const saveFile = async (blob, filename, { title, text } = {}) => {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

  if (isAppleTouchDevice() && !isSecure()) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'insecure';
  }

  if (isAppleTouchDevice() && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: title || filename, text });
      return 'shared';
    } catch (error) {
      // The user closing the sheet is a decision, not a failure.
      if (error?.name === 'AbortError') return 'cancelled';
      // Anything else (share unavailable mid-flight, permission refused) falls
      // through to the download path rather than losing the file.
    }
  }

  if (downloadViaAnchor(blob, filename)) return 'saved';

  // Last resort: a browser with neither share nor download. Opening the blob at
  // least puts the document in front of the user, who can save it by hand.
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: title || filename, text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'opened';
};

/**
 * Filesystem-safe filename fragment. Keeps spaces out of the name so the file
 * survives being emailed, shared over WhatsApp, or dropped onto a Windows share.
 */
export const slugify = (input, fallback = 'document') => {
  const slug = String(input || '')
    // NFKD splits accented letters into base + combining mark, so the mark is
    // dropped by the strip below and "Café" becomes "cafe" rather than "caf".
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return slug || fallback;
};

/** Local calendar date as YYYY-MM-DD. `toISOString` would shift across midnight in PKT. */
export const isoDate = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
