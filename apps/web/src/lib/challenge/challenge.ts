import { TURNSTILE_SITE_KEY } from "@/lib/env";

// The check that a visitor with no account is a person (Cloudflare Turnstile), asked for when their
// session is minted. The session layer only asks for a token; the chat that is open hosts the
// widget (VisitorCheck). No chat hosting, no check: nothing else ever loads Turnstile.

/** The widget could not give a token. `unsupported`: this browser cannot complete the check (a TV's,
 * which has no way to answer an interactive one). `failed`: it errored or timed out. */
export class ChallengeError extends Error {
  readonly kind: "unsupported" | "failed";

  constructor(kind: "unsupported" | "failed") {
    super(`The challenge ${kind === "failed" ? "failed" : "is unsupported"}`);
    this.name = "ChallengeError";
    this.kind = kind;
  }
}

export interface ChallengeHost {
  /** Runs the check, once, and gives its token. */
  solve(): Promise<string>;
}

let host: ChallengeHost | null = null;

/** Whether this build was given a widget. Without one (development, tests) no token is sent. */
export const challengeConfigured = (): boolean => TURNSTILE_SITE_KEY !== null;

/** Makes the open page the one that runs the check, until the returned function is called. */
export function hostChallenge(next: ChallengeHost): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

export function solveChallenge(): Promise<string> {
  if (!host) return Promise.reject(new ChallengeError("failed"));
  return host.solve();
}
