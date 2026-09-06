/**
 * Haptics — uses Capacitor Haptics when running natively, falls back to
 * the Vibration API on web. Silently no-ops where unsupported.
 */
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

const patterns = { light: 8, medium: 16, heavy: 28, success: [10, 40, 14], warn: [18, 60, 18] }

export function haptic(kind = 'light') {
  try {
    const native = window.Capacitor?.Plugins?.Haptics
    if (native) {
      if (kind === 'success' || kind === 'warn') native.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' })
      else native.impact({ style: kind.toUpperCase() })
      return
    }
    if (canVibrate) navigator.vibrate(patterns[kind] ?? 8)
  } catch {
    /* no-op */
  }
}
