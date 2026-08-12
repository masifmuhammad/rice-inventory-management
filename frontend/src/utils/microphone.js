/**
 * Mobile-safe microphone helpers.
 *
 * Phones often fail voice input because:
 * - getUserMedia needs a secure context (HTTPS / localhost)
 * - Safari needs audio/mp4 MediaRecorder, not webm
 * - a denied permission cannot be re-prompted; the user must use Settings
 * Typing always remains available — voice is optional.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
];

export const isSecureMicContext = () =>
  typeof window !== 'undefined' &&
  (window.isSecureContext === true ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname));

export const canUseMediaDevices = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

export const canUseMediaRecorder = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';

export const pickRecorderMimeType = () => {
  if (!canUseMediaRecorder()) return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

/** Map MediaRecorder mime → OpenRouter / Whisper format token. */
export const formatFromMime = (mime = '') => {
  const m = String(mime).toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
};

/**
 * @returns {'granted'|'denied'|'prompt'|'unsupported'|'insecure'}
 */
export const getMicPermissionState = async () => {
  if (!isSecureMicContext()) return 'insecure';
  if (!canUseMediaDevices()) return 'unsupported';

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'microphone' });
      if (status?.state === 'granted' || status?.state === 'denied' || status?.state === 'prompt') {
        return status.state;
      }
    }
  } catch {
    /* Safari often rejects Permissions.query for microphone */
  }

  return 'prompt';
};

/**
 * Request mic access from a user gesture. Stops tracks immediately when
 * `keepAlive` is false — useful for a one-shot permission warm-up.
 */
export const requestMicrophoneAccess = async ({ keepAlive = false } = {}) => {
  if (!isSecureMicContext()) {
    const err = new Error('Microphone needs HTTPS (or localhost) on phones.');
    err.code = 'insecure';
    throw err;
  }
  if (!canUseMediaDevices()) {
    const err = new Error('This browser cannot use the microphone.');
    err.code = 'unsupported';
    throw err;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  if (!keepAlive) {
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }
  return stream;
};

export const micErrorMessage = (error) => {
  const name = error?.name || '';
  const code = error?.code || '';

  if (code === 'insecure' || !isSecureMicContext()) {
    return 'Voice needs a secure link (HTTPS). You can keep typing instead.';
  }
  if (code === 'unsupported' || !canUseMediaDevices()) {
    return 'This browser cannot use the mic. Type your request instead.';
  }
  if (!canUseMediaRecorder()) {
    return 'Voice recording is not supported here. Please type instead.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone blocked. Allow it in browser/site settings, or type instead.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Microphone is busy in another app. Close it and try again.';
  }
  return error?.message || 'Could not open the microphone. Try typing instead.';
};
