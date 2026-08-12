/**
 * Subtle multimodal feedback — success / error / commit.
 *
 * Haptics:
 * - Android: Vibration API (`navigator.vibrate`)
 * - iPhone (Safari / installed PWA, iOS 17.4+): Apple still does not expose
 *   Core Haptics or Vibration API to the web — installing the app does not
 *   unlock it. We use a progressive enhancement: briefly toggle a hidden
 *   `<input type="checkbox" switch>` which can fire the Taptic Engine on
 *   supported iOS builds. If Apple disables that path, we no-op and sound
 *   still carries the moment.
 *
 * Sound: tiny Web Audio tones (no asset files), unlocked after first tap.
 *
 * Fire on the same frame as the visual toast for harmony.
 */

const STORAGE_SOUND = 'ui-feedback-sound';
const STORAGE_HAPTICS = 'ui-feedback-haptics';

let audioCtx = null;
let unlocked = false;
let iosSwitchEl = null;

const canUseWindow = () => typeof window !== 'undefined';

export const getFeedbackPrefs = () => ({
  sound: canUseWindow() ? localStorage.getItem(STORAGE_SOUND) !== '0' : true,
  haptics: canUseWindow() ? localStorage.getItem(STORAGE_HAPTICS) !== '0' : true,
});

export const setFeedbackPrefs = ({ sound, haptics }) => {
  if (!canUseWindow()) return;
  if (typeof sound === 'boolean') localStorage.setItem(STORAGE_SOUND, sound ? '1' : '0');
  if (typeof haptics === 'boolean') localStorage.setItem(STORAGE_HAPTICS, haptics ? '1' : '0');
  window.dispatchEvent(new Event('ui-feedback-prefs'));
};

/** Rough capability hint for Settings copy — not a guarantee on every iOS build. */
export const getHapticsSupportHint = () => {
  if (!canUseWindow()) return 'none';
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return 'vibrate';
  // iPhone / iPad Safari (including Add to Home Screen / PWA).
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios-switch';
  }
  return 'none';
};

const prefersReducedMotion = () =>
  canUseWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getCtx = () => {
  if (!canUseWindow()) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
};

/** Call once from a user gesture so iOS allows later tones. */
export const unlockFeedbackAudio = () => {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  unlocked = true;
  ensureIosSwitch();
};

const tone = (freq, { duration = 0.06, gain = 0.045, type = 'sine', delay = 0 } = {}) => {
  // Sound is independent of reduced-motion — phones often have that a11y flag on,
  // and silencing chimes made feedback feel "broken" with no vibration API.
  if (!getFeedbackPrefs().sound) return;
  const ctx = getCtx();
  if (!ctx) return;
  // iOS suspends AudioContext aggressively; resume on every play attempt.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  if (!unlocked && ctx.state !== 'running') return;

  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

/**
 * Hidden iOS 17.4+ switch — the only documented web path that can ping Taptic
 * Engine. Must stay in the DOM; recreating every pulse is less reliable.
 */
const ensureIosSwitch = () => {
  if (!canUseWindow() || iosSwitchEl) return iosSwitchEl;
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.setAttribute('switch', '');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.001;pointer-events:none;margin:0;padding:0;border:0;';
  document.body.appendChild(el);
  iosSwitchEl = el;
  return el;
};

/** One Taptic-style pulse via the switch control when Vibration API is missing. */
const iosSwitchPulse = () => {
  const el = ensureIosSwitch();
  if (!el) return;
  try {
    // Flip state — this is what can trigger the system haptic on supported iOS.
    el.checked = !el.checked;
    // Some builds only fire on a trusted click; try both.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.click();
  } catch {
    /* ignore */
  }
};

const vibrate = (pattern, { pulses = 1 } = {}) => {
  if (!getFeedbackPrefs().haptics) return;
  // Skip haptic motion when the user asked for less motion; sound still plays.
  if (prefersReducedMotion()) return;

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
      return;
    } catch {
      /* fall through */
    }
  }

  // iPhone PWA / Safari — no navigator.vibrate. Attempt switch pulses.
  iosSwitchPulse();
  for (let i = 1; i < pulses; i += 1) {
    window.setTimeout(iosSwitchPulse, 55 * i);
  }
};

/** Soft confirm — product saved, report downloaded, cash recorded. */
export const feedbackSuccess = () => {
  vibrate([12, 40, 18], { pulses: 2 });
  tone(660, { duration: 0.05, gain: 0.035, delay: 0 });
  tone(880, { duration: 0.09, gain: 0.04, delay: 0.055 });
};

/** Gentle warning — empty export, validation. */
export const feedbackWarning = () => {
  vibrate([22], { pulses: 1 });
  tone(420, { duration: 0.08, gain: 0.03, type: 'triangle' });
};

/** Error — failed save / network. */
export const feedbackError = () => {
  vibrate([35, 45, 35], { pulses: 3 });
  tone(220, { duration: 0.1, gain: 0.04, type: 'triangle' });
  tone(180, { duration: 0.12, gain: 0.03, type: 'triangle', delay: 0.08 });
};

/** Light tick — archive, toggle, minor commit (not every tap). */
export const feedbackTick = () => {
  vibrate(8, { pulses: 1 });
  tone(520, { duration: 0.035, gain: 0.025 });
};

/** Download / share moment — same family as success, slightly brighter. */
export const feedbackDownload = () => {
  vibrate([10, 30, 10, 30, 16], { pulses: 2 });
  tone(740, { duration: 0.045, gain: 0.03 });
  tone(990, { duration: 0.08, gain: 0.038, delay: 0.05 });
  tone(1180, { duration: 0.06, gain: 0.028, delay: 0.11 });
};
