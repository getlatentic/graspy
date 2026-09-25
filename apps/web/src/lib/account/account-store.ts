// Who is signed in on this device, and which of the account's learners it learns as, kept
// beside Firebase's own copy so the app knows at startup without loading Firebase.

export interface Learner {
  id: string;
  name: string;
}

export interface Account {
  uid: string;
  name: string | null;
  email: string | null;
  /** Null until one is chosen on "Who's learning?". */
  learner: Learner | null;
  /** Until the first learner is chosen after signing in, the device's own plan and
   * progress join that learner. */
  deviceJoins: boolean;
}

/** Who the account is, as Google names them. */
export type Identity = Pick<Account, "uid" | "name" | "email">;

export const ACCOUNT_KEY = "graspy.account";

const listeners = new Set<() => void>();

// An account kept before accounts held learners has neither field: it signed in with the
// device's plan, which joins the first learner chosen.
function withLearner(account: Partial<Account> & { uid: string }): Account {
  return {
    uid: account.uid,
    name: account.name ?? null,
    email: account.email ?? null,
    learner: account.learner ?? null,
    deviceJoins: account.deviceJoins ?? !account.learner,
  };
}

function stored(): Account | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    const account = raw ? (JSON.parse(raw) as Partial<Account>) : null;
    return account?.uid ? withLearner({ ...account, uid: account.uid }) : null;
  } catch {
    return null;
  }
}

let current: Account | null = stored();

function store(account: Account | null): void {
  try {
    if (account) {
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    } else {
      window.localStorage.removeItem(ACCOUNT_KEY);
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

/** The learner the device learns as; choosing one ends the device's joining. */
export function setLearner(learner: Learner | null): void {
  if (!current) return;
  setAccount({
    ...current,
    learner,
    deviceJoins: learner ? false : current.deviceJoins,
  });
}

/** Where plan sync keeps what it agreed with this learner. */
export const learnerKeyOf = (account: Account): string | null =>
  account.learner ? `${account.uid}/${account.learner.id}` : null;

// Another tab signing in or out writes the same key.
function onStorage(event: StorageEvent): void {
  if (event.key !== ACCOUNT_KEY && event.key !== null) return;
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
