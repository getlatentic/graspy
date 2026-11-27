import { challengeConfigured, solveChallenge } from "@/lib/challenge/challenge";
import { tryVisitor } from "@/lib/try-visitor";
import { ApiError, CHALLENGE_REQUIRED } from "./errors";
import { issued, post, type Issued } from "./session-wire";

// The session of someone who has not signed in, for the chat alone. It names a random id their
// browser holds and no device, so the server keeps nothing of them under it. The device's own
// session, which lessons and plans use, is a separate one (session.ts).

interface Held {
  token: string;
  expiresAt: number;
}

const STORAGE_KEY = "graspy.visitor-session";

// So a token cannot lapse during a minutes-long stream.
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let held: Held | null = readStored();
let pending: Promise<string> | null = null;

function readStored(): Held | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Held) : null;
  } catch {
    return null;
  }
}

function keep(next: Held | null): void {
  held = next;
  try {
    if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage denied: the in-memory copy still serves the tab.
  }
}

const usable = (session: Held | null): session is Held =>
  !!session && session.expiresAt - RENEW_MARGIN_MS > Date.now();

// A visitor's session is renewed by presenting the one it replaces, which carries the proof that
// their browser passed the check. Only a visit with no such session, or one the server will not
// renew (too old), runs the check, and the check's token is single use.
async function mintIssued(previous: string | undefined): Promise<Issued> {
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

async function mint(): Promise<string> {
  const { token, expiresIn } = await mintIssued(held?.token);
  keep({ token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

/** The visitor's session token; a cold load that asks several times shares one handshake. */
export function getVisitorToken(): Promise<string> {
  if (usable(held)) return Promise.resolve(held.token);
  pending ??= mint().finally(() => {
    pending = null;
  });
  return pending;
}

/** Forgets the token and makes another, with a new check: the one the server refused is not
 * presented again. */
export function refreshVisitorToken(): Promise<string> {
  keep(null);
  return getVisitorToken();
}
