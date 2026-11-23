// What a TV keeps of signing in from a phone: the credential its sessions are renewed from. A
// TV has no Google sign-in to renew with, so this stands where Firebase's does on other devices.
// It is the one secret the device holds for the account, so it goes when the account does.

export const TV_CREDENTIAL_KEY = "graspy.tv-credential";

export function tvCredential(): string | null {
  try {
    return window.localStorage.getItem(TV_CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function keepTvCredential(credential: string): void {
  try {
    window.localStorage.setItem(TV_CREDENTIAL_KEY, credential);
  } catch {
    // Storage refused: this tab stays signed in until it closes.
  }
}

export function forgetTvCredential(): void {
  try {
    window.localStorage.removeItem(TV_CREDENTIAL_KEY);
  } catch {
    // Nothing was kept that could be removed.
  }
}
