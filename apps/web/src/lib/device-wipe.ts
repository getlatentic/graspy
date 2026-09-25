import { ACCOUNT_KEY } from "@/lib/account/account-store";
import { DEVICE_ID_KEY, newDeviceId } from "@/lib/device-id";
import { committed, openDB } from "@/lib/idb";

// A device shared by a family or a school keeps nothing of one learner for the next.

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
 * conversations, offline copies and unsent calls, profile and caches. The account and
 * the device id stay. */
export async function wipeLearnerData(): Promise<void> {
  await clearStores();
  forgetLocal(
    (key) => key === ACCOUNT_KEY || key === DEVICE_ID_KEY || isFirebases(key),
  );
}

/** Signed out: the learner's data and the account go, and the device takes a new id.
 * The interface language, kept in a cookie, stays. */
export async function wipeDevice(): Promise<void> {
  await clearStores();
  forgetLocal(isFirebases);
  newDeviceId();
}
