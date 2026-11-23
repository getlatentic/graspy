import {
  endAccountSession,
  startAccountSession,
  startParentSession,
} from "@/lib/api/session";
import { currentAccount } from "./account-store";
import { warmApi } from "@/lib/warm-api";
import { wipeDevice } from "@/lib/device-wipe";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import type * as GoogleAuth from "./google-auth";
import { deleteAccount } from "./learners-api";
import { tvCredential } from "./tv-credential";
import { signOutTv } from "./tv-link-api";

type Google = typeof GoogleAuth;

export type SignInProblem = "popupBlocked" | "failed";

// Closing the popup, or tapping again while one is open, is the learner's choice.
const CANCELLED = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

let prepared: Google | null = null;

async function loadGoogle(): Promise<Google> {
  const google = await import("./google-auth");
  await google.prepareGoogle();
  prepared = google;
  return google;
}

/** Loads Firebase before the tap: Safari blocks a popup that opens after awaiting a download. */
export function prepareSignIn(): void {
  if (prepared) return;
  loadGoogle().catch((error: unknown) =>
    console.warn("Loading Google sign-in failed:", error),
  );
}

/** Call from the tap itself. The account then asks who is learning. */
export async function signIn(): Promise<void> {
  // The popup takes the learner several seconds; the server wakes up meanwhile, so the call after it is not the first.
  warmApi();
  const google = prepared ?? (await loadGoogle());
  const { account, idToken } = await google.signInWithGoogle();
  try {
    await startAccountSession(idToken, account);
  } catch (error) {
    await google.signOutOfGoogle().catch(() => undefined);
    throw error;
  }
}

/** The parent signs in again: a token from a sign-in just now. Call from the tap itself. */
export async function signInAgain(): Promise<string> {
  const google = prepared ?? (await loadGoogle());
  return google.reauthenticateWithGoogle();
}

/**
 * One Google sign-in that is both the account's session and the parent's, for what only a parent
 * may do. Signed out, the sign-in makes the account's session and, from the same token, the
 * parent's; signed in as a child or after the parent's minutes, signing in again makes the
 * parent's. Either way it is one tap, and the second sign-in a parent would otherwise be asked
 * for never comes. Call from the tap itself.
 */
export async function signInAsParent(): Promise<void> {
  warmApi();
  const google = prepared ?? (await loadGoogle());
  if (currentAccount()) {
    await startParentSession(await google.reauthenticateWithGoogle());
    return;
  }
  const { account, idToken } = await google.signInWithGoogle();
  try {
    await startAccountSession(idToken, account);
    await startParentSession(idToken);
  } catch (error) {
    endAccountSession();
    await google.signOutOfGoogle().catch(() => undefined);
    throw error;
  }
}

/** Nothing of the account or its learner stays on the device. */
export async function signOut(): Promise<void> {
  // The TV's credential is revoked while it is still held; if the server cannot be reached it
  // stays on the account's list of TVs, to remove there.
  const credential = tvCredential();
  if (credential) await signOutTv(credential).catch(() => undefined);
  endAccountSession();
  await wipeDevice();
  wipeOnNextStart("device");
  const google = prepared ?? (await import("./google-auth"));
  await google.signOutOfGoogle();
}

/** Before a learner is chosen, the device holds only its own learning, which stays. */
export async function leaveForAnotherAccount(): Promise<void> {
  endAccountSession();
  const google = prepared ?? (await import("./google-auth"));
  await google.signOutOfGoogle();
}

/** Every learner and all graspy kept for them; the Google account stays Google's. */
export async function deleteAccountAndSignOut(): Promise<void> {
  await deleteAccount();
  await signOut();
}

/** Null when the learner cancelled, which needs no message. */
export function signInProblem(error: unknown): SignInProblem | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && CANCELLED.has(code)) return null;
  return code === "auth/popup-blocked" ? "popupBlocked" : "failed";
}
