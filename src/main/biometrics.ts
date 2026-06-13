import { systemPreferences } from "electron";

/**
 * Touch ID gating for sensitive actions (revealing a stored password).
 * Only macOS exposes a biometric prompt through Electron.
 */

export function canUseBiometrics(): boolean {
  return process.platform === "darwin" && systemPreferences.canPromptTouchID();
}

/**
 * Resolves true when the user authenticates, false when they cancel or fail.
 * When the machine has no Touch ID hardware we allow the action: the macOS
 * account password already guards the running session, so there is nothing
 * stronger to fall back to.
 */
export async function requireBiometric(reason: string): Promise<boolean> {
  if (!canUseBiometrics()) {
    return true;
  }

  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false;
  }
}
