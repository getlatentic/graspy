import { endAccountSession, startAccountSession } from "@/lib/api/session";
import { forgetPlanSync } from "@/lib/plan-sync";
import type * as GoogleAuth from "./google-auth";

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

/** Call from the tap itself. */
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

/** The plan stays on the device; the next sign-in joins it to the account again. */
export async function signOut(): Promise<void> {
  endAccountSession();
  forgetPlanSync();
  const google = prepared ?? (await import("./google-auth"));
  await google.signOutOfGoogle();
}

/** Null when the learner cancelled, which needs no message. */
export function signInProblem(error: unknown): SignInProblem | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && CANCELLED.has(code)) return null;
  return code === "auth/popup-blocked" ? "popupBlocked" : "failed";
}
