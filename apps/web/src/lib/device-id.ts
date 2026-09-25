import FingerprintJS from "@fingerprintjs/fingerprintjs";

// Nobody signs in, so the device stands for the learner. The id is random, not the
// fingerprint: two phones of one model share a fingerprint, and would share a record.
const STORAGE_KEY = "graspy_device_id";
// What the server accepts (schemas.DEVICE_ID_PATTERN and FINGERPRINT_PATTERN).
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const FINGERPRINT = /^[a-f0-9]{8,64}$/;
// The hint is worth no more than this wait before a session is asked for.
const FINGERPRINT_MS = 1000;

let hint: Promise<string | null> | null = null;

function stored(): string | null {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    return id && DEVICE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function keep(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage refused: this visit is a device of its own.
  }
}

export function deviceId(): string {
  const kept = stored();
  if (kept) return kept;
  const made = crypto.randomUUID();
  keep(made);
  return made;
}

async function fingerprinted(): Promise<string | null> {
  try {
    // Without monitoring the library sends nothing to its makers' servers.
    const agent = await FingerprintJS.load({ monitoring: false });
    const { visitorId } = await agent.get();
    return FINGERPRINT.test(visitorId) ? visitorId : null;
  } catch (error) {
    console.warn("Fingerprinting failed:", error);
    return null;
  }
}

/** A hint beside the id, never naming a learner; null when not made in time. */
export function fingerprint(): Promise<string | null> {
  hint ??= fingerprinted();
  return Promise.race([
    hint,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), FINGERPRINT_MS),
    ),
  ]);
}
