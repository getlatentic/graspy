import { askForParentSession, fetchAsParent } from "@/lib/api/session";
import { ACCOUNT_URL, call, refusalCode } from "./account-call";

// The parent PIN (app/api/account_pin_routes.py, docs/PARENT_PIN.md). Typing it, or setting one
// after a Google sign-in just made, makes the parent's session (lib/api/session.ts). The PIN is
// sent in the body of one call and kept nowhere: not in a URL, in storage or in the log.

const PIN_URL = `${ACCOUNT_URL}/parent-pin`;

export const MIN_PIN_LENGTH = 6;
export const MAX_PIN_LENGTH = 8;
/** The length the pad asks for when a parent has no PIN yet. */
export const DEFAULT_PIN_LENGTH = 6;

export interface PinStatus {
  hasPin: boolean;
  /** How many digits the PIN has, once there is one. */
  length: number | null;
  /** Until when the account is locked, in milliseconds since the epoch. */
  lockedUntil: number | null;
  /** Too many wrong PINs since the last Google sign-in: only Forgot PIN works. */
  disabled: boolean;
}

export function getPinStatus(): Promise<PinStatus> {
  return call(PIN_URL, "GET");
}

/** The parent's session, for the right PIN. */
export function verifyPin(pin: string): Promise<void> {
  return askForParentSession("/account/parent-pin/verify", "POST", { pin });
}

/** Sets the PIN, or replaces it, and makes the parent's session. The proof is a Google
 * sign-in just made, or the PIN being replaced. */
export function savePin(
  pin: string,
  proof: { firebaseIdToken: string } | { currentPin: string },
): Promise<void> {
  return askForParentSession("/account/parent-pin", "PUT", { pin, ...proof });
}

/** What the server said of a refused PIN: wrong, with the tries left, or locked until a time. */
export type PinRefusal =
  | { kind: "wrong"; attemptsLeft: number | null }
  | { kind: "locked"; until: number }
  | { kind: "notSet" }
  | { kind: "busy" }
  | { kind: "disabled" }
  | { kind: "tooEasy" };

export function pinRefusalOf(error: unknown): PinRefusal | null {
  const code = refusalCode(error);
  const detail = (
    error as {
      data?: { detail?: { attemptsLeft?: unknown; lockedUntil?: unknown } };
    }
  ).data?.detail;
  switch (code) {
    case "pin_wrong":
      return {
        kind: "wrong",
        attemptsLeft:
          typeof detail?.attemptsLeft === "number" ? detail.attemptsLeft : null,
      };
    case "pin_locked":
      return typeof detail?.lockedUntil === "number"
        ? { kind: "locked", until: detail.lockedUntil }
        : null;
    case "pin_not_set":
      return { kind: "notSet" };
    case "rate_limited":
      return { kind: "busy" };
    case "pin_disabled":
      return { kind: "disabled" };
    case "pin_too_easy":
      return { kind: "tooEasy" };
    default:
      return null;
  }
}

export { tooEasy } from "./weak-pins";

/** What a parent has not yet seen of their PIN. */
export interface PinEvent {
  id: number;
  kind: "locked" | "disabled" | "wrong" | "reset" | "tv_linked" | "consent";
  at: number;
  /** The wrong PINs of a lock, or the TVs a reset signed out. */
  count: number | null;
}

export async function getPinActivity(): Promise<PinEvent[]> {
  return (await call<{ events: PinEvent[] }>(`${PIN_URL}/activity`, "GET"))
    .events;
}

/** Only under the parent's session made from a Google sign-in just now. */
export function acknowledgePinActivity(upTo: number): Promise<void> {
  return call(
    `${PIN_URL}/activity/acknowledge`,
    "POST",
    { upTo },
    fetchAsParent,
  );
}
