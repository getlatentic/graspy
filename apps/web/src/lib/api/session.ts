import {
  currentAccount,
  setAccount,
  setLearner,
  type Account,
  type Identity,
  type Learner,
} from "@/lib/account/account-store";
import { deviceId, fingerprint } from "@/lib/device-id";
import { wipeDevice } from "@/lib/device-wipe";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import { API_BASE_URL } from "@/lib/env";
import { ApiError, toApiError, toNetworkError } from "./errors";

// A token naming this device, or once the learner signs in with Google their account, and
// the account's learner the device learns as.

interface Session {
  token: string;
  expiresAt: number;
  // Absent from tokens stored before tokens named a device: those re-mint.
  device?: string;
  // The Firebase uid when the token names the learner's account.
  account?: string;
  // The account's learner it reads and writes for; without one it manages learners only.
  learner?: string;
}

export interface Issued {
  token: string;
  expiresIn: number;
  learner?: Learner | null;
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

// A token minted for whoever was signed in, or learning, before is not this learner's; nor
// one naming the device before it took a new id on signing out.
function usable(session: Session | null): session is Session {
  const account = currentAccount();
  return (
    !!session?.device &&
    session.device === deviceId() &&
    session.account === account?.uid &&
    session.learner === account?.learner?.id &&
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
  const { token, expiresIn, learner } = (await response.json()) as Issued;
  if (!token) throw new ApiError("The server issued an empty session", 0);
  return { token, expiresIn, learner };
}

async function deviceSession(device: string): Promise<Response> {
  const hint = await fingerprint();
  return post({ deviceId: device, ...(hint ? { fingerprint: hint } : {}) });
}

// A module that failed to load is a TypeError; Firebase gives a failure to reach Google its own code.
const couldNotReachGoogle = (cause: unknown) =>
  cause instanceof TypeError ||
  (cause as { code?: unknown } | null)?.code === "auth/network-request-failed";

async function idToken(fresh: boolean): Promise<string | null> {
  try {
    const { googleIdToken } = await import("@/lib/account/google-auth");
    return await googleIdToken(fresh);
  } catch (cause) {
    if (couldNotReachGoogle(cause)) throw toNetworkError(cause);
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(`Google refused the sign-in: ${message}`, 0);
  }
}

function accountPost(device: string, account: Account, token: string) {
  const body: Record<string, string> = {
    deviceId: device,
    firebaseIdToken: token,
  };
  if (account.learner) body.learnerId = account.learner.id;
  return post(body);
}

// Refused once, the ID token is made again: the server's clock may count it expired.
async function accountSession(
  device: string,
  account: Account,
): Promise<Response | null> {
  const token = await idToken(false);
  if (!token) return null;
  const response = await accountPost(device, account, token);
  if (response.status !== 401) return response;
  const fresh = await idToken(true);
  return fresh ? accountPost(device, account, fresh) : null;
}

// Firebase no longer holds the sign-in (revoked, or the Google account deleted): signed
// out as from the account card, nothing of the learner stays, and the app starts again.
async function signedOutElsewhere(): Promise<never> {
  setAccount(null);
  keep(null);
  await wipeDevice();
  wipeOnNextStart("device");
  window.location.assign("/");
  throw new ApiError("Signed out", 401);
}

async function signedInSession(device: string, account: Account) {
  const response = await accountSession(device, account);
  if (!response) return signedOutElsewhere();
  return { response, account: account.uid };
}

// A learner removed on another device comes back as none: the device then asks who is
// learning. A rename elsewhere comes back as the new name.
function followLearner(sent: Learner | null, { learner }: Issued): void {
  if (!sent || learner === undefined) return;
  if (learner?.id === sent.id && learner.name === sent.name) return;
  setLearner(learner ? { id: learner.id, name: learner.name } : null);
}

async function mint(): Promise<string> {
  const device = deviceId();
  const signedIn = currentAccount();
  const { response, account } = signedIn
    ? await signedInSession(device, signedIn)
    : { response: await deviceSession(device), account: undefined };
  const answered = await issued(response);
  followLearner(signedIn?.learner ?? null, answered);
  if (currentAccount()?.uid === account) {
    const learner = answered.learner?.id;
    const expiresAt = Date.now() + answered.expiresIn * 1000;
    keep({ token: answered.token, expiresAt, device, account, learner });
  }
  return answered.token;
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

/** Exchanges a Google sign-in for a session naming the account, before any learner is
 * chosen: the device's plan and progress join the first one chosen. */
export async function startAccountSession(
  firebaseIdToken: string,
  identity: Identity,
): Promise<void> {
  const device = deviceId();
  const { token, expiresIn } = await issued(
    await post({ deviceId: device, firebaseIdToken }),
  );
  pending = null;
  setAccount({ ...identity, learner: null, deviceJoins: true });
  keep({
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    device,
    account: identity.uid,
  });
}

/** Takes a session the server issued for one of the account's learners. */
export function keepLearnerSession({
  token,
  expiresIn,
  learner,
}: Issued): void {
  const account = currentAccount();
  if (!account || !learner) throw new ApiError("No learner was chosen", 0);
  pending = null;
  setLearner({ id: learner.id, name: learner.name });
  keep({
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    device: deviceId(),
    account: account.uid,
    learner: learner.id,
  });
}

/** Still signed in, with no learner chosen. */
export function leaveLearnerSession(): void {
  pending = null;
  setLearner(null);
  keep(null);
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
