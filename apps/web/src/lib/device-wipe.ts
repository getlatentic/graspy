import { ACCOUNT_KEY } from "@/lib/account/account-store";
import { isServiceConsentKey } from "@/lib/account/service-consent";
import { TV_CREDENTIAL_KEY } from "@/lib/account/tv-credential";
import { TV_KNOWN_ACCOUNTS_KEY } from "@/lib/account/tv-known-accounts";
import { DEVICE_ID_KEY, newDeviceId } from "@/lib/device-id";
import { committed, openDB } from "@/lib/idb";
import { INSTALL_DISMISSED_KEY } from "@/lib/install";

// A device shared by a family or a school keeps nothing of one learner for the next.
// What the device itself remembers, that its owner declined to install the app, stays.
// A TV's credential belongs to the account, not to the learner: wiping a learner must not strand
// it, where the account still lists the TV as signed in.

// Firebase manages its own keys, and signing out of it removes them.
const isFirebases = (key: string) => key.startsWith("firebase:");

async function clearStores(): Promise<void> {
  const db = await openDB();
  const names = [...db.objectStoreNames];
  if (names.length === 0) return;
  const tx = db.transaction(names, "readwrite");
  const done = committed(tx);
  for (const name of names) tx.objectStore(name).clear();
  await done;
}

function forgetLocal(kept: (key: string) => boolean): void {
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys.filter((key) => !kept(key))) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage refused: nothing was kept there.
  }
}

/** Everything the learner in use kept here: their plan, lessons, progress, practice,
 * conversations, offline copies and unsent calls, profile and caches. The account, the
 * device id and what the account's parents agreed to stay. */
export async function wipeLearnerData(): Promise<void> {
  await clearStores();
  forgetLocal(
    (key) =>
      key === ACCOUNT_KEY ||
      key === DEVICE_ID_KEY ||
      key === INSTALL_DISMISSED_KEY ||
      isFirebases(key) ||
      isServiceConsentKey(key) ||
      key === TV_CREDENTIAL_KEY ||
      key === TV_KNOWN_ACCOUNTS_KEY,
  );
}

/** Signed out: the learner's data and the account go, and the device takes a new id.
 * The interface language, kept in a cookie, stays. */
export async function wipeDevice(): Promise<void> {
  await clearStores();
  forgetLocal((key) => isFirebases(key) || key === INSTALL_DISMISSED_KEY);
  newDeviceId();
}
