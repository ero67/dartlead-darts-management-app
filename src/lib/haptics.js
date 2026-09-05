import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Tactile feedback for the scoring screen, native shell only.
//
// Deliberately a no-op in the browser: the plugin's web fallback would make
// Android phones vibrate on the live website, a behaviour change nobody asked
// for. Every call swallows errors — a device without a vibrator must never
// break scoring.
//
// Strength is a per-device preference (Device Settings): 'off' | 'light' |
// 'medium' | 'strong'. Devices differ a lot, and some venues want silence.
const native = Capacitor.isNativePlatform();
const fire = (promise) => promise.catch(() => {});

export const HAPTICS_STORAGE_KEY = 'dartlead-haptics';
export const HAPTIC_LEVELS = ['off', 'light', 'medium', 'strong'];
const DEFAULT_LEVEL = 'medium';

let level = DEFAULT_LEVEL;
try {
  const saved = localStorage.getItem(HAPTICS_STORAGE_KEY);
  if (HAPTIC_LEVELS.includes(saved)) level = saved;
} catch {
  // storage unavailable — keep the default
}

export const isHapticsAvailable = () => native;
export const getHapticsLevel = () => level;
export const setHapticsLevel = (next) => {
  if (!HAPTIC_LEVELS.includes(next)) return;
  level = next;
  try { localStorage.setItem(HAPTICS_STORAGE_KEY, next); } catch { /* ignore */ }
};

const enabled = () => native && level !== 'off';
const tapStyle = () => (level === 'light' ? ImpactStyle.Light : level === 'strong' ? ImpactStyle.Heavy : ImpactStyle.Medium);

// Keypad tap: confirms the entry registered while the scorer looks at the board.
export const hapticTap = () => {
  if (enabled()) fire(Haptics.impact({ style: tapStyle() }));
};

// Bust: distinct "something went wrong" pattern.
export const hapticBust = () => {
  if (enabled()) fire(Haptics.notification({ type: NotificationType.Error }));
};

// Leg won.
export const hapticLegWon = () => {
  if (enabled()) fire(Haptics.notification({ type: NotificationType.Success }));
};

// Match won: one long buzz (shorter on the light setting).
export const hapticMatchWon = () => {
  if (enabled()) fire(Haptics.vibrate({ duration: level === 'light' ? 200 : level === 'strong' ? 600 : 400 }));
};
