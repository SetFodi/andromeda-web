/**
 * Preserves an unparseable / corrupt localStorage value under a sibling
 * `<key>.corrupt` entry before the caller falls back to defaults, so a one-off
 * corruption or an unrecognized schema never silently destroys user data — it
 * can be inspected or recovered instead of being overwritten and lost.
 *
 * Best-effort: if storage itself is unavailable or full, there is nothing more
 * we can safely do, so the failure is swallowed.
 */
export function quarantineCorruptValue(key: string, rawValue: string | null): void {
  if (!rawValue) {
    return;
  }
  try {
    localStorage.setItem(`${key}.corrupt`, rawValue);
  } catch {
    // Storage unavailable/full — give up quietly.
  }
}
