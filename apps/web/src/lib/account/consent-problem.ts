import { refusalCode } from "./account-call";
import { NOT_SIGNED_IN } from "./google-auth-codes";
import { signInProblem } from "./sign-in";

/** Why a parent's agreement did not go through, as far as the parent can act on it. */
export type ConsentProblem =
  | "popupBlocked"
  | "browser"
  | "signedOut"
  | "otherAccount"
  | "notGoogle"
  | "signIn"
  | "notice"
  | "notKept"
  | "failed";

// What the server names when the sign-in sent with a consent does not hold (docs/API.md).
const REFUSALS: Record<string, ConsentProblem> = {
  sign_in_stale: "signIn",
  sign_in_invalid: "signIn",
  sign_in_unchecked: "signIn",
  sign_in_other_account: "otherAccount",
  sign_in_not_google: "notGoogle",
  notice_unknown: "notice",
  consent_not_kept: "notKept",
};

// Firebase's own codes, and the one graspy throws when Firebase holds nobody signed in.
const FIREBASE_CODES: Record<string, ConsentProblem> = {
  "auth/user-mismatch": "otherAccount",
  "auth/operation-not-supported-in-this-environment": "browser",
  [NOT_SIGNED_IN]: "signedOut",
};

/** Null when the parent closed Google's window, which needs no message. */
export function consentProblemOf(error: unknown): ConsentProblem | null {
  const refused = refusalCode(error);
  if (refused) return REFUSALS[refused] ?? "failed";
  const code = (error as { code?: unknown } | null)?.code;
  return FIREBASE_CODES[String(code)] ?? signInProblem(error);
}
