import {
  currentAccount,
  setAccount,
  type Account,
} from "@/lib/account/account-store";
import { deviceId, fingerprint } from "@/lib/device-id";
import { API_BASE_URL } from "@/lib/env";
import { ApiError, toApiError, toNetworkError } from "./errors";

// A token naming this device, or the learner's account once they sign in with Google.

interface Session {
  token: string;
  expiresAt: number;
  // Absent from tokens stored before tokens named a device: those re-mint.
  device?: string;
  // The Firebase uid when the token names the learner's account.
  account?: string;
}

interface Issued {
  token: string;
  expiresIn: number;
}

const STORAGE_KEY = "graspy.session";

// So a token cannot lapse during a minutes-long stream.
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let cached: Session | null = readStored();
let pending: Promise<string> | null = null;

function readStored(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStored(session: Session | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage denied: the in-memory copy still serves the tab.
  }
}

function keep(session: Session | null): void {
  cached = session;
  writeStored(session);
}

// A token minted for whoever was signed in before is not this learner's.
function usable(session: Session | null): session is Session {
  return (
    !!session?.device &&
    session.account === currentAccount()?.uid &&
    session.expiresAt - RENEW_MARGIN_MS > Date.now()
  );
}

async function post(body: Record<string, string>): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
}

async function issued(response: Response): Promise<Issued> {
  if (!response.ok) throw await toApiError(response);
  const { token, expiresIn } = (await response.json()) as Issued;
  if (!token) throw new ApiError("The server issued an empty session", 0);
  return { token, expiresIn };
}

async function deviceSession(device: string): Promise<Response> {
  const hint = await fingerprint();
  return post({ deviceId: device, ...(hint ? { fingerprint: hint } : {}) });
}

async function idToken(fresh: boolean): Promise<string | null> {
  try {
    const { googleIdToken } = await import("@/lib/account/google-auth");
    return await googleIdToken(fresh);
  } catch (cause) {
    throw toNetworkError(cause);
  }
}

// Refused once, the ID token is made again: the server's clock may count it expired.
async function accountSession(device: string): Promise<Response | null> {
  const token = await idToken(false);
  if (!token) return null;
  const response = await post({ deviceId: device, firebaseIdToken: token });
  if (response.status !== 401) return response;
  const fresh = await idToken(true);
  return fresh ? post({ deviceId: device, firebaseIdToken: fresh }) : null;
}

async function signedInSession(device: string, account: Account) {
  const response = await accountSession(device);
  if (response) return { response, account: account.uid };
  // Firebase no longer holds the sign-in (revoked, or the account removed): the learner
  // is signed out, which the account card then shows.
  setAccount(null);
  return { response: await deviceSession(device), account: undefined };
}

async function mint(): Promise<string> {
  const device = deviceId();
  const signedIn = currentAccount();
  const { response, account } = signedIn
    ? await signedInSession(device, signedIn)
    : { response: await deviceSession(device), account: undefined };
  const { token, expiresIn } = await issued(response);
  if (currentAccount()?.uid === account) {
    keep({ token, expiresAt: Date.now() + expiresIn * 1000, device, account });
  }
  return token;
}

// A cold load fires several requests at once; they share one handshake.
export function getSessionToken(): Promise<string> {
  if (usable(cached)) return Promise.resolve(cached.token);

  if (!pending) {
    const minting: Promise<string> = mint().finally(() => {
      if (pending === minting) pending = null;
    });
    pending = minting;
  }
  return pending;
}

export async function refreshSessionToken(): Promise<string> {
  keep(null);
  return getSessionToken();
}

/** Exchanges a Google sign-in for a session naming the learner's account. */
export async function startAccountSession(
  firebaseIdToken: string,
  account: Account,
): Promise<void> {
  const device = deviceId();
  const { token, expiresIn } = await issued(
    await post({ deviceId: device, firebaseIdToken }),
  );
  pending = null;
  setAccount(account);
  keep({
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    device,
    account: account.uid,
  });
}

/** Back to the device's own session. */
export function endAccountSession(): void {
  pending = null;
  setAccount(null);
  keep(null);
}

export async function fetchWithSession(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  // A Headers instance spreads to nothing.
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const response = await send(await getSessionToken());
  if (response.status !== 401) return response;
  return send(await refreshSessionToken());
}
