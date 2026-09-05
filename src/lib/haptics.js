import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Tactile feedback for the scoring screen, native shell only.
//
// Deliberately a no-op in the browser: the plugin's web fallback would make
// Android phones vibrate on the live website, a behaviour change nobody asked
// for. Every call swallows errors — a device without a vibrator must never
// break scoring.
const native = Capacitor.isNativePlatform();
const fire = (promise) => promise.catch(() => {});

// Keypad tap: confirms the entry registered while the scorer looks at the board.
export const hapticTap = () => {
  if (native) fire(Haptics.impact({ style: ImpactStyle.Light }));
};

// Bust: distinct "something went wrong" pattern.
export const hapticBust = () => {
  if (native) fire(Haptics.notification({ type: NotificationType.Error }));
};

// Leg won.
export const hapticLegWon = () => {
  if (native) fire(Haptics.notification({ type: NotificationType.Success }));
};

// Match won: one long buzz.
export const hapticMatchWon = () => {
  if (native) fire(Haptics.vibrate({ duration: 400 }));
};
