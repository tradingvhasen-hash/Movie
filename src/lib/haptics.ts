/**
 * A short buzz where the device has a motor, and silence where it does not.
 *
 * This is the cheapest available half of "I want to feel each swipe" — on a
 * phone the vibration is literally the only part of the feedback the hand
 * receives rather than the eye. `navigator.vibrate` is Android and Chrome
 * only; iOS Safari has no API for it and simply returns undefined, so this is
 * a no-op there rather than a broken feature.
 *
 * Kept deliberately short. Anything over ~20ms reads as a notification rather
 * than as a click, and a notification-length buzz a thousand times a session
 * is the fastest way to get the setting turned off.
 */
type Pattern = "tick" | "commit" | "undo";

const PATTERNS: Record<Pattern, number | number[]> = {
  /** crossing the point where the card would commit */
  tick: 8,
  /** the verdict landing */
  commit: [11, 26, 16],
  /** taking one back */
  undo: [6, 40, 6],
};

export function haptic(pattern: Pattern, enabled = true) {
  if (!enabled || typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(PATTERNS[pattern]);
  } catch {
    /* some browsers throw when the page is not visible; nothing to do */
  }
}
