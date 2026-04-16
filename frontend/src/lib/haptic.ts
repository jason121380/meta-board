/**
 * Haptic feedback utility — triggers short vibration patterns on
 * devices that support the Vibration API (Android Chrome, etc.).
 *
 * iOS Safari ignores navigator.vibrate() entirely (Apple doesn't
 * expose haptics to the web), but calling it is a no-op, not an
 * error — so there's zero cost on iOS and free tactile feedback
 * on every other platform.
 *
 * Call sites: Toggle status, confirm dialog, toast, tab switch.
 */

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported — silently ignore */
  }
}

/** Short tap — button press, tab switch. */
export function hapticTap(): void {
  vibrate(8);
}

/** Success — mutation completed, save confirmed. */
export function hapticSuccess(): void {
  vibrate([8, 30, 8]);
}

/** Warning — confirm dialog opened, destructive action pending. */
export function hapticWarning(): void {
  vibrate([15, 20, 15]);
}
