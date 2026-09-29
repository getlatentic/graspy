// A parent's agreement to graspy teaching a learner cannot be withdrawn, so once the server
// has said it holds one, the device need not ask again, and the learner opens offline. The
// device forgets it when it is signed out; switching learners keeps it (device-wipe.ts).

const KEY_PREFIX = "graspy.service-consent.";

export const isServiceConsentKey = (key: string): boolean =>
  key.startsWith(KEY_PREFIX);

const keyOf = (account: string, learner: string) =>
  `${KEY_PREFIX}${account}/${learner}`;

export function serviceConsentKept(account: string, learner: string): boolean {
  try {
    return window.localStorage.getItem(keyOf(account, learner)) !== null;
  } catch {
    return false;
  }
}

export function keepServiceConsent(account: string, learner: string): void {
  try {
    window.localStorage.setItem(keyOf(account, learner), String(Date.now()));
  } catch {
    // Storage refused: the server is asked again next time.
  }
}
