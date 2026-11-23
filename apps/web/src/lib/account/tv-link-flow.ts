import { ApiError } from "@/lib/api/errors";
import {
  cancelTvLink,
  continueTvLink,
  pollTvLink,
  startTvLink,
  type TvApprover,
  type TvApproval,
  type TvLinkRequest,
  type TvPoll,
} from "./tv-link-api";

export type TvLinkState =
  | { kind: "starting" }
  | { kind: "waiting"; request: TvLinkRequest; expiresAt: number }
  /** The phone approved; the person at the TV decides whether to be linked to this learner. */
  | {
      kind: "linking";
      learnerName: string;
      approver: TvApprover;
      busy: boolean;
    }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "declined" }
  | { kind: "failed" };

export interface TvLinkRun {
  onState: (state: TvLinkState) => void;
  onApproved: (approval: TvApproval) => void;
}

export interface TvLink {
  /** Ends the request, if it is not already over, and stops everything. */
  stop: () => void;
  /** The person at the TV confirms the learner: the session is given now, and not before. */
  confirm: () => void;
  /** The person at the TV declines: nothing is given, and the request ends. */
  decline: () => void;
}

export interface TvLinkDeps {
  start: (signal: AbortSignal) => Promise<TvLinkRequest>;
  poll: (deviceCode: string, signal: AbortSignal) => Promise<TvPoll>;
  release: (deviceCode: string, signal: AbortSignal) => Promise<TvPoll>;
  cancel: (deviceCode: string) => Promise<void>;
  now: () => number;
  /** Resolves after `ms`, or rejects when the signal aborts. */
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
}

// A poll that failed to reach the server is tried again after a pause that doubles, to this.
const FIRST_RETRY_MS = 2_000;
const LONGEST_RETRY_MS = 30_000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const REAL: TvLinkDeps = {
  start: startTvLink,
  poll: pollTvLink,
  release: continueTvLink,
  cancel: cancelTvLink,
  now: () => Date.now(),
  wait,
};

const retryable = (error: unknown) =>
  !(error instanceof ApiError) || error.retryable;

/**
 * Asks for a code and polls it at the interval the server gives, longer when it says slow_down
 * and after each failure to reach it, until the phone answers or the code expires. An approval
 * is not a sign-in: the TV shows whom it is to be linked to and waits for the person to confirm
 * or decline. Whatever ends the request before that, a new code or leaving the screen, cancels
 * it at the server.
 */
export function runTvLink(run: TvLinkRun, deps: TvLinkDeps = REAL): TvLink {
  const controller = new AbortController();
  const { signal } = controller;
  let request: TvLinkRequest | null = null;
  let linking: Extract<TvLinkState, { kind: "linking" }> | null = null;
  // Over: its session was taken, or the server said it ended. Nothing is left to cancel.
  let over = false;
  const report = (state: TvLinkState) => {
    if (!signal.aborted) run.onState(state);
  };
  const end = (state: TvLinkState) => {
    over = true;
    report(state);
  };

  async function pollUntilAnswered(
    asked: TvLinkRequest,
    expiresAt: number,
  ): Promise<void> {
    let interval = asked.interval * 1000;
    let failures = 0;
    for (;;) {
      const pause =
        failures > 0
          ? Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), LONGEST_RETRY_MS)
          : interval;
      // Never past the code's end, so its expiry is reported when it comes.
      await deps.wait(
        Math.min(pause, Math.max(0, expiresAt - deps.now())),
        signal,
      );
      if (deps.now() >= expiresAt) return end({ kind: "expired" });
      let polled: TvPoll;
      try {
        polled = await deps.poll(asked.deviceCode, signal);
      } catch (error) {
        if (signal.aborted) return;
        if (!retryable(error)) return end({ kind: "failed" });
        failures += 1;
        continue;
      }
      failures = 0;
      if (polled.status === "linking") {
        linking = {
          kind: "linking",
          learnerName: polled.learner.name,
          approver: polled.approver ?? {},
          busy: false,
        };
        return report(linking);
      }
      if (polled.status === "expired") return end({ kind: "expired" });
      if (polled.status === "denied") return end({ kind: "denied" });
      if (polled.status === "approved") return;
      if (polled.interval) interval = polled.interval * 1000;
    }
  }

  async function go() {
    report({ kind: "starting" });
    let asked: TvLinkRequest;
    try {
      asked = await deps.start(signal);
    } catch {
      return end({ kind: "failed" });
    }
    request = asked;
    const expiresAt = deps.now() + asked.expiresIn * 1000;
    report({ kind: "waiting", request: asked, expiresAt });
    await pollUntilAnswered(asked, expiresAt);
  }

  async function release(asked: TvLinkRequest) {
    let given: TvPoll;
    try {
      given = await deps.release(asked.deviceCode, signal);
    } catch {
      return end({ kind: "failed" });
    }
    if (given.status === "approved") {
      const { status: _, ...approval } = given;
      over = true;
      return run.onApproved(approval);
    }
    end({ kind: given.status === "denied" ? "denied" : "expired" });
  }

  go().catch(() => undefined);
  return {
    stop: () => {
      controller.abort();
      if (request && !over) {
        over = true;
        void deps.cancel(request.deviceCode);
      }
    },
    confirm: () => {
      if (!request || over || !linking) return;
      report({ ...linking, busy: true });
      void release(request);
    },
    decline: () => {
      if (!request || over) return;
      const asked = request;
      over = true;
      void deps.cancel(asked.deviceCode);
      report({ kind: "declined" });
    },
  };
}
