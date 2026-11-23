import { askForParentSession } from "@/lib/api/session";
import { ACCOUNT_URL, call, refusalCode } from "./account-call";

// The parent PIN (app/api/account_pin_routes.py, docs/PARENT_PIN.md). Typing it, or setting one
// after a Google sign-in just made, makes the parent's session (lib/api/session.ts). The PIN is
// sent in the body of one call and kept nowhere: not in a URL, in storage or in the log.

const PIN_URL = `${ACCOUNT_URL}/parent-pin`;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;
/** The length the pad asks for when a parent has no PIN yet. */
export const DEFAULT_PIN_LENGTH = 4;

export interface PinStatus {
  hasPin: boolean;
  /** How many digits the PIN has, once there is one. */
  length: number | null;
  /** Until when the account is locked, in milliseconds since the epoch. */
  lockedUntil: number | null;
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
    case "pin_too_easy":
      return { kind: "tooEasy" };
    default:
      return null;
  }
}

/** Digits that repeat or run on are the first guesses of someone trying PINs (the server
 * refuses them too). */
export function tooEasy(pin: string): boolean {
  if (new Set(pin).size === 1) return true;
  const steps = new Set<number>();
  for (let at = 1; at < pin.length; at += 1) {
    steps.add(Number(pin[at]) - Number(pin[at - 1]));
  }
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}
