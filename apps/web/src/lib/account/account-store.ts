// Who is signed in on this device, kept beside Firebase's own copy so the app knows at
// startup without loading Firebase.

export interface Account {
  uid: string;
  name: string | null;
  email: string | null;
}

const STORAGE_KEY = "graspy.account";

const listeners = new Set<() => void>();

function stored(): Account | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const account = raw ? (JSON.parse(raw) as Partial<Account>) : null;
    return account?.uid ? (account as Account) : null;
  } catch {
    return null;
  }
}

let current: Account | null = stored();

function store(account: Account | null): void {
  try {
    if (account) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage refused: this tab stays signed in until it closes.
  }
}

function changed(): void {
  for (const listener of listeners) listener();
}

/** The same object until the account changes, as React's external stores require. */
export function currentAccount(): Account | null {
  return current;
}

export function setAccount(account: Account | null): void {
  current = account;
  store(account);
  changed();
}

// Another tab signing in or out writes the same key.
function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  current = stored();
  changed();
}

export function onAccountChange(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}
