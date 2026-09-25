import { endAccountSession, startAccountSession } from "@/lib/api/session";
import { wipeDevice } from "@/lib/device-wipe";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import type * as GoogleAuth from "./google-auth";
import { deleteAccount } from "./learners-api";

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
  const google = prepared ?? (await loadGoogle());
  const { account, idToken } = await google.signInWithGoogle();
  try {
    await startAccountSession(idToken, account);
  } catch (error) {
    await google.signOutOfGoogle().catch(() => undefined);
    throw error;
  }
}

/** Nothing of the account or its learner stays on the device. */
export async function signOut(): Promise<void> {
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
