import {
  currentAccount,
  setAccount,
  setLearner,
  type Account,
  type Identity,
  type Learner,
} from "@/lib/account/account-store";
import { deviceId, fingerprint } from "@/lib/device-id";
import { tryVisitor } from "@/lib/try-visitor";
import { challengeConfigured, solveChallenge } from "@/lib/challenge/challenge";
import {
  forgetTvCredential,
  keepTvCredential,
  tvCredential,
} from "@/lib/account/tv-credential";
import type { TvApproval } from "@/lib/account/tv-link-api";
import { wipeDevice } from "@/lib/device-wipe";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import { LearnerChanged } from "@/lib/learner-pin";
import { API_BASE_URL } from "@/lib/env";
import { readJson } from "./body";
import {
  ApiError,
  CHALLENGE_REQUIRED,
  SignInUnchecked,
  toApiError,
  toNetworkError,
} from "./errors";

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
  // Named no device and no account: the visit of someone who has not signed in (/try).
  anonymous?: boolean;
}

export interface Issued {
  token: string;
  expiresIn: number;
  learner?: Learner | null;
}

const STORAGE_KEY = "graspy.session";

// So a token cannot lapse during a minutes-long stream.
const RENEW_MARGIN_MS = 5 * 60 * 1000;

// The parent's session is short, so only the last moments are left out.
const PARENT_MARGIN_MS = 30 * 1000;

let cached: Session | null = readStored();
let pending: { anonymous: boolean; token: Promise<string> } | null = null;

// While a page that keeps nothing of its visitor is open (/try), and nobody is signed in, the
// session names no device: the server then has no record to keep anything under.
let anonymousHolds = 0;

/** Whether the requests now being made are those of a visit that names no device. */
export const isAnonymousSession = (): boolean =>
  anonymousHolds > 0 && currentAccount() === null;

/** Makes the device's requests carry a session that names no device, until the returned
 * function is called. Not in force once someone signs in. */
export function holdAnonymousSession(): () => void {
  anonymousHolds += 1;
  return () => {
    anonymousHolds -= 1;
  };
}

// The parent's own session, made just after they typed their PIN or signed in again: what a
// learner's recordings are managed under, as a learner's session is refused them. Held in memory
// only, for the signed-in account, and only for the minutes the server gives it.
let parent: {
  token: string;
  expiresAt: number;
  startedAt: number;
  account: string;
} | null = null;
const parentListeners = new Set<() => void>();

function setParent(next: typeof parent): void {
  parent = next;
  parentListeners.forEach((listener) => listener());
}

/** Called when the parent's session is made, refused or ended: what the parent gate shows. */
export function subscribeParentSession(listener: () => void): () => void {
  parentListeners.add(listener);
  return () => void parentListeners.delete(listener);
}

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
  const anonymous = isAnonymousSession();
  return (
    !!session &&
    !!session.anonymous === anonymous &&
    (anonymous || (!!session.device && session.device === deviceId())) &&
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

// graspy answers 503 sign_in_unchecked when it could not reach Google to check the sign-in.
async function notIssued(response: Response): Promise<ApiError> {
  const refused = await toApiError(response);
  const { detail } = (refused.data ?? {}) as {
    detail?: { error?: unknown; code?: unknown };
  };
  if (detail?.code !== "sign_in_unchecked") return refused;
  return new SignInUnchecked(
    String(detail.error),
    refused.status,
    refused.data,
  );
}

async function issued(response: Response): Promise<Issued> {
  if (!response.ok) throw await notIssued(response);
  const body = await readJson<Issued | null>(response);
  if (!body?.token) {
    throw new ApiError("The server issued an empty session", response.status);
  }
  return {
    token: body.token,
    expiresIn: body.expiresIn,
    learner: body.learner,
  };
}

async function deviceSession(device: string): Promise<Response> {
  const hint = await fingerprint();
  return post({ deviceId: device, ...(hint ? { fingerprint: hint } : {}) });
}

// Firebase's codes for a Google that was busy or failed, as the statuses a later try may pass.
const GOOGLE_FAILED = new Map([
  ["auth/too-many-requests", 429],
  ["auth/internal-error", 503],
]);

// Not reached: the module failed to load (a TypeError), or Firebase could not reach Google.
function googleFailure(cause: unknown): ApiError {
  const code = (cause as { code?: unknown } | null)?.code;
  if (cause instanceof TypeError || code === "auth/network-request-failed") {
    return toNetworkError(cause);
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  const failed = typeof code === "string" ? GOOGLE_FAILED.get(code) : undefined;
  return failed
    ? new SignInUnchecked(
        `Google could not check the sign-in: ${message}`,
        failed,
      )
    : new ApiError(`Google refused the sign-in: ${message}`, 401);
}

async function idToken(fresh: boolean): Promise<string | null> {
  try {
    const { googleIdToken } = await import("@/lib/account/google-auth");
    return await googleIdToken(fresh);
  } catch (cause) {
    throw googleFailure(cause);
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
  forgetTvCredential();
  setAccount(null);
  keep(null);
  await wipeDevice();
  wipeOnNextStart("device");
  window.location.assign("/");
  throw new ApiError("Signed out", 401);
}

const GONE_FOR_GOOD = new Set([401, 403, 404]);

// A renewal whose answer is lost has already changed the credential at the server, which answers
// the old one again for about a minute. So the same credential is presented again, a few times
// within that minute, before giving up: a TV on a poor network is not signed out for it.
const RENEWAL_RETRY_MS = [2_000, 5_000, 12_000];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The credential is read from storage before each try, not once: another tab of this TV may have
// renewed since, and the one it kept is the one that is current. Null when there is none.
async function renewalAnswer(): Promise<Response | null> {
  for (let attempt = 0; ; attempt += 1) {
    const credential = tvCredential();
    if (!credential) return null;
    const last = attempt === RENEWAL_RETRY_MS.length;
    try {
      const response = await fetch(`${API_BASE_URL}/tv-sign-in/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: credential }),
      });
      if (response.status < 500 || last) return response;
    } catch (cause) {
      if (last) throw toNetworkError(cause);
    }
    await pause(RENEWAL_RETRY_MS[attempt]);
  }
}

// Each renewal replaces the credential: the new one is kept before the session is used, as the
// one just spent is of no use again.
async function keepRenewedCredential(response: Response): Promise<void> {
  if (!response.ok) return;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { refreshToken?: unknown } | null;
  if (typeof body?.refreshToken === "string") {
    keepTvCredential(body.refreshToken);
  }
}

// A TV has no Google sign-in: its sessions are renewed from the credential the phone's approval
// gave it, until the account removes the TV.
async function tvSession(account: Account) {
  const response = await renewalAnswer();
  if (!response) return signedOutElsewhere();
  // Revoked, or its learner or the parent's agreement is gone: nothing will make it work.
  if (GONE_FOR_GOOD.has(response.status)) return signedOutElsewhere();
  await keepRenewedCredential(response);
  return { response, account: account.uid };
}

async function signedInSession(device: string, account: Account) {
  if (tvCredential()) return tvSession(account);
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

// A visitor's session is renewed by presenting the one it replaces, which carries the proof that
// their browser passed the check. Only a visit with no such session, or one the server will not
// renew (too old), runs the check, and the check's token is single use.
async function anonymousIssued(previous: string | undefined): Promise<Issued> {
  const visitor = tryVisitor();
  if (previous || !challengeConfigured()) {
    try {
      return await issued(
        await post(previous ? { visitor, renewal: previous } : { visitor }),
      );
    } catch (refused) {
      const askedForCheck =
        refused instanceof ApiError && refused.code === CHALLENGE_REQUIRED;
      if (!askedForCheck || !challengeConfigured()) throw refused;
    }
  }
  return issued(await post({ visitor, challenge: await solveChallenge() }));
}

async function mintAnonymous(): Promise<string> {
  const previous = cached?.anonymous ? cached.token : undefined;
  const { token, expiresIn } = await anonymousIssued(previous);
  // Released, or signed in, while the handshake ran: this token is not the one now wanted.
  if (!isAnonymousSession()) return getSessionToken();
  keep({ token, expiresAt: Date.now() + expiresIn * 1000, anonymous: true });
  return token;
}

async function mint(): Promise<string> {
  if (isAnonymousSession()) return mintAnonymous();
  const device = deviceId();
  const signedIn = currentAccount();
  const { response, account } = signedIn
    ? await signedInSession(device, signedIn)
    : { response: await deviceSession(device), account: undefined };
  const answered = await issued(response);
  followLearner(signedIn?.learner ?? null, answered);
  // Not over the anonymous session a page now holds, which is the one in use.
  if (currentAccount()?.uid === account && !isAnonymousSession()) {
    const learner = answered.learner?.id;
    const expiresAt = Date.now() + answered.expiresIn * 1000;
    keep({ token: answered.token, expiresAt, device, account, learner });
  }
  return answered.token;
}

// A cold load fires several requests at once; they share one handshake.
export function getSessionToken(): Promise<string> {
  if (usable(cached)) return Promise.resolve(cached.token);

  const anonymous = isAnonymousSession();
  if (pending?.anonymous === anonymous) return pending.token;
  const minting = {
    anonymous,
    token: mint().finally(() => {
      if (pending === minting) pending = null;
    }),
  };
  pending = minting;
  return minting.token;
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

/** A TV signed in from a phone: it learns as the learner the phone chose, and renews its
 * session from the credential it was given. */
export function startTvSession(approval: TvApproval): void {
  const { token, expiresIn, refreshToken, account, learner } = approval;
  pending = null;
  keepTvCredential(refreshToken);
  setAccount({
    uid: account,
    name: null,
    email: null,
    learner: { id: learner.id, name: learner.name },
    deviceJoins: false,
  });
  keep({
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    device: deviceId(),
    account,
    learner: learner.id,
  });
}

/** Takes a session the server issued for one of the account's learners. */
export function keepLearnerSession({
  token,
  expiresIn,
  learner,
}: Issued): void {
  const account = currentAccount();
  if (!account || !learner) throw new Error("No learner was chosen");
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
  setParent(null);
  forgetTvCredential();
  setAccount(null);
  keep(null);
}

/** The parent's session is not made or kept without their proving who they are. */
export class ParentSignInNeeded extends ApiError {
  constructor() {
    super("Prove you are the parent", 401);
  }
}

/** How long the parent's session has been in force, in milliseconds, or null without one. */
export function parentSessionAge(): number | null {
  return hasParentSession() && parent ? Date.now() - parent.startedAt : null;
}

/** Lets go of the parent's session, so the parent gate asks for the PIN again: an agreement needs
 * a session that is minutes old at most. */
export function dropParentSession(): void {
  setParent(null);
}

/** Whether a call failed for want of the parent's session: the parent gate then asks again. */
export function parentRefused(error: unknown): boolean {
  return error instanceof ParentSignInNeeded;
}

/** When the parent's session ends, in milliseconds since the epoch, or null without one. */
export function parentSessionEnds(): number | null {
  return hasParentSession() && parent
    ? parent.expiresAt - PARENT_MARGIN_MS
    : null;
}

export function hasParentSession(): boolean {
  const account = currentAccount();
  return (
    !!parent &&
    parent.account === account?.uid &&
    parent.expiresAt - PARENT_MARGIN_MS > Date.now()
  );
}

/** Asks for the parent's session, which the server keeps for minutes: a call that carries a
 * proof (the PIN, or a Google sign-in just made) and answers with it. Sent under the session in
 * use, as the server checks it is the same account's. A refusal is thrown as it came. */
export async function askForParentSession(
  path: string,
  method: "POST" | "PUT",
  body: object,
): Promise<void> {
  const account = currentAccount();
  if (!account) throw new ApiError("Sign in first", 401);
  const response = await fetchWithSession(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { token, expiresIn } = await issued(response);
  if (currentAccount()?.uid !== account.uid) return;
  setParent({
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    startedAt: Date.now(),
    account: account.uid,
  });
}

/** The parent's session from a Google sign-in made just now. */
export function startParentSession(firebaseIdToken: string): Promise<void> {
  return askForParentSession("/account/parent-session", "POST", {
    firebaseIdToken,
  });
}

const REFUSED_SESSION = new Set(["session_invalid", "session_required"]);

// The server refusing the session itself, not another 401 of the request such as a stale
// sign-in sent in its body.
async function sessionRefused(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) return false;
  const { detail } = ((await toApiError(response.clone())).data ?? {}) as {
    detail?: { code?: unknown };
  };
  const code = String(detail?.code);
  return REFUSED_SESSION.has(code) || code === "account_required";
}

/** Sent as the parent, with the session the parent's proof made, whichever learner is in use.
 * Without one, or once the server refuses it, the parent is asked to prove themselves again. */
export async function fetchAsParent(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!hasParentSession() || !parent) throw new ParentSignInNeeded();
  const sent = parent;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${sent.token}`);
  const response = await fetch(input, { ...init, headers });
  if (await sessionRefused(response)) {
    if (parent === sent) setParent(null);
    throw new ParentSignInNeeded();
  }
  return response;
}

/** Sent with the session in use. `still`, asked as each try is sent, may stop it: false, and
 * the session is no longer the one the request was made for, so nothing is sent. Nor is the
 * session renewed: it is the next learner's. */
export async function fetchWithSession(
  input: string | URL,
  init: RequestInit = {},
  still?: () => boolean,
): Promise<Response> {
  const hold = () => {
    if (still && !still()) throw new LearnerChanged();
  };
  // A Headers instance spreads to nothing.
  const send = (token: string) => {
    hold();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const response = await send(await getSessionToken());
  if (response.status !== 401) return response;
  hold();
  return send(await refreshSessionToken());
}
