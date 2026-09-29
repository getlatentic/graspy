import { refusalCode } from "./account-call";
import { signInProblem } from "./sign-in";

/** Why a parent's agreement did not go through, as far as the parent can act on it. */
export type ConsentProblem =
  "popupBlocked" | "otherAccount" | "signIn" | "notice" | "failed";

// What the server names when the sign-in sent with a consent does not hold (docs/API.md).
const REFUSALS: Record<string, ConsentProblem> = {
  sign_in_stale: "signIn",
  sign_in_invalid: "signIn",
  sign_in_unchecked: "signIn",
  sign_in_other_account: "otherAccount",
  notice_unknown: "notice",
};

/** Null when the parent closed Google's window, which needs no message. */
export function consentProblemOf(error: unknown): ConsentProblem | null {
  const refused = refusalCode(error);
  if (refused) return REFUSALS[refused] ?? "failed";
  // Firebase, on a sign-in again with another Google account than the one signed in.
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "auth/user-mismatch") return "otherAccount";
  return signInProblem(error);
}
