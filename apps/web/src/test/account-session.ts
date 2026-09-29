import { setAccount } from "@/lib/account/account-store";
import { ApiError } from "@/lib/api/errors";

export const UID = "uid-1";

/** Signed in on this device as a Google account, with the learner in use, if any. */
export function signedInAs(learner: { id: string; name: string } | null): void {
  setAccount({
    uid: UID,
    name: "Tunde Parent",
    email: "tunde@example.com",
    learner,
    deviceJoins: false,
  });
}

/** The server's refusal of an account's call, as the app reads it. */
export function refused(status: number, code: string): ApiError {
  return new ApiError("refused", status, {
    detail: { error: "refused", code },
  });
}

/** What Firebase throws when the parent closes Google's window. */
export const WINDOW_CLOSED = { code: "auth/popup-closed-by-user" };

/** A learner as the account lists them. */
export function listed(
  id: string,
  name: string,
  serviceConsent: { noticeVersion: number; grantedAt: number } | null,
) {
  return { id, name, createdAt: 1, serviceConsent, voiceConsent: null };
}

export const AGREED = { noticeVersion: 1, grantedAt: 100 };
