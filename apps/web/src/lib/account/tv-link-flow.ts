import { ApiError } from "@/lib/api/errors";
import {
  cancelTvLink,
  continueTvLink,
  pollTvLink,
  signOutTv,
  startTvLink,
  type TvApprover,
  type TvApproval,
  type TvLinkRequest,
  type TvPoll,
} from "./tv-link-api";
import { lastInputAt } from "./tv-presence";

export type TvLinkState =
  | { kind: "starting" }
  | { kind: "waiting"; request: TvLinkRequest; expiresAt: number }
  /**
   * The phone approved; the person at the TV decides whether to be linked to this learner. With
   * `auto` the TV goes on by itself at `continuesAt` (milliseconds since the epoch) unless
   * declined; without it, it waits for the person to press Continue.
   */
  | {
      kind: "linking";
      learnerName: string;
      approver: TvApprover;
      auto: boolean;
      continuesAt: number | null;
      busy: boolean;
    }
  /** The account already has the most TVs: the request is kept, for the person to remove one
   * on their phone and continue. */
  | { kind: "full" }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "declined" }
  | { kind: "failed" };

export interface TvLinkRun {
  onState: (state: TvLinkState) => void;
  onApproved: (approval: TvApproval) => void;
}

export interface TvLink {
  /** Ends the request, if it is not already over, and stops everything. Where the session is
   * already being given, it is given and then signed out again, so no credential outlives the
   * screen with nobody holding it. */
  stop: () => void;
  /** The TV goes on: the session is given now, and not before. Once is enough; a second call
   * while it is being given does nothing. */
  confirm: () => void;
  /** The person at the TV declines: nothing is given, and the request ends. Where the session
   * is already being given, the screen waits for it and the credential is signed out. */
  decline: () => void;
}

export interface TvLinkDeps {
  start: (signal: AbortSignal) => Promise<TvLinkRequest>;
  poll: (deviceCode: string, signal: AbortSignal) => Promise<TvPoll>;
  /** Not abortable: whether it was given must be known. */
  release: (deviceCode: string) => Promise<TvPoll>;
  cancel: (deviceCode: string) => Promise<void>;
  /** Signs a TV out by its credential, for one that was given with nobody to hold it. */
  signOut: (refreshToken: string) => Promise<void>;
  /** Wall clock, milliseconds since the epoch. */
  now: () => number;
  /** A clock that only runs forward, in milliseconds. */
  mono: () => number;
  /** Whether the page is being looked at. */
  visible: () => boolean;
  /** When the TV last saw a key, pointer or touch, or null. */
  lastInput: () => number | null;
  /** Resolves after `ms`, or rejects when the signal aborts. */
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** How long the person at the TV has to say no, once a phone has approved. */
export const VETO_MS = 5_000;
/** The TV goes on by itself only if it saw input this recently when the phone approved. */
export const PRESENCE_MS = 120_000;
/** A timer that fires this much late was not running: the page was frozen, or the TV slept. */
export const OVERSHOOT_MS = 2_000;

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
  release: (deviceCode) => continueTvLink(deviceCode),
  cancel: cancelTvLink,
  signOut: signOutTv,
  now: () => Date.now(),
  mono: () => performance.now(),
  visible: () => document.visibilityState === "visible",
  lastInput: lastInputAt,
  wait,
};

const retryable = (error: unknown) =>
  !(error instanceof ApiError) || error.retryable;

/**
 * Asks for a code and polls it at the interval the server gives, longer when it says slow_down
 * and after each failure to reach it, until the phone answers or the code expires. An approval
 * is not a sign-in: the TV shows whom it is to be linked to.
 *
 * It goes on by itself, after a few seconds for the person to say no, only when someone is
 * plainly there: the page is visible, the TV saw input in the two minutes before the approval,
 * and the timer fires on time. Otherwise (a screen nobody is using, a page that was frozen) it
 * does not call the server at all and waits for the person to press Continue.
 *
 * Whatever ends the request before the session is given, a new code or leaving the screen,
 * cancels it at the server. Once the session is being given, it is waited for: a credential
 * made for a screen that was left, or declined, is signed out again.
 */
export function runTvLink(run: TvLinkRun, deps: TvLinkDeps = REAL): TvLink {
  const controller = new AbortController();
  const { signal } = controller;
  let request: TvLinkRequest | null = null;
  let linking: Extract<TvLinkState, { kind: "linking" }> | null = null;
  // Over: its session was taken, or the server said it ended. Nothing is left to cancel.
  let over = false;
  // The session is being asked for. It cannot be taken back by cancelling, only signed out.
  let releasing = false;
  // Left or declined while the session was being asked for: it is not to be kept.
  let abandoned: "left" | "declined" | null = null;
  const report = (state: TvLinkState) => {
    if (!signal.aborted) run.onState(state);
  };
  const end = (state: TvLinkState) => {
    over = true;
    report(state);
  };

  const present = () => {
    const last = deps.lastInput();
    return deps.visible() && last !== null && deps.now() - last <= PRESENCE_MS;
  };

  function arm(continuesAt: number) {
    const startedMono = deps.mono();
    const startedWall = deps.now();
    deps.wait(Math.max(0, continuesAt - startedWall), signal).then(
      () => fire(startedMono, startedWall),
      () => undefined,
    );
  }

  function fire(startedMono: number, startedWall: number) {
    if (over || releasing || !linking) return;
    const late = Math.max(deps.mono() - startedMono, deps.now() - startedWall);
    // Not looked at, or not running for longer than it was asked to wait: nobody saw the screen
    // count down, so it does not go on. The person is asked instead.
    if (!deps.visible() || late > VETO_MS + OVERSHOOT_MS) {
      linking = { ...linking, auto: false, continuesAt: null };
      return report(linking);
    }
    confirm();
  }

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
        const auto = present();
        linking = {
          kind: "linking",
          learnerName: polled.learner.name,
          approver: polled.approver ?? {},
          auto,
          continuesAt: auto ? deps.now() + VETO_MS : null,
          busy: false,
        };
        report(linking);
        if (linking.continuesAt !== null) arm(linking.continuesAt);
        return;
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
      given = await deps.release(asked.deviceCode);
    } catch {
      return end({ kind: abandoned === "declined" ? "declined" : "failed" });
    }
    if (given.status === "approved") {
      const { status: _, ...approval } = given;
      over = true;
      if (abandoned) {
        // The person left or said no while it was being given: it is signed out, not kept.
        void deps.signOut(approval.refreshToken).catch(() => undefined);
        return report({ kind: "declined" });
      }
      return run.onApproved(approval);
    }
    if (given.status === "full") {
      releasing = false;
      if (abandoned) {
        over = true;
        void deps.cancel(asked.deviceCode);
        return report({ kind: "declined" });
      }
      return report({ kind: "full" });
    }
    if (abandoned === "declined") return end({ kind: "declined" });
    end({ kind: given.status === "denied" ? "denied" : "expired" });
  }

  function confirm() {
    if (!request || over || releasing || !linking) return;
    releasing = true;
    report({ ...linking, busy: true });
    void release(request);
  }

  function decline() {
    if (!request || over) return;
    if (releasing) {
      abandoned = "declined";
      return;
    }
    over = true;
    void deps.cancel(request.deviceCode);
    report({ kind: "declined" });
  }

  go().catch(() => undefined);
  return {
    stop: () => {
      controller.abort();
      if (releasing && !over) abandoned ??= "left";
      else if (request && !over) {
        over = true;
        void deps.cancel(request.deviceCode);
      }
    },
    confirm,
    decline,
  };
}
