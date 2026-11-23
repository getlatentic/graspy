import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/errors";
import {
  OVERSHOOT_MS,
  PRESENCE_MS,
  runTvLink,
  VETO_MS,
  type TvLinkDeps,
  type TvLinkState,
} from "./tv-link-flow";
import type { TvApproval, TvLinkRequest, TvPoll } from "./tv-link-api";

const { startTvLink, pollTvLink, continueTvLink, cancelTvLink, signOutTv } =
  vi.hoisted(() => ({
    startTvLink: vi.fn<(signal?: AbortSignal) => Promise<TvLinkRequest>>(),
    pollTvLink:
      vi.fn<(code: string, signal?: AbortSignal) => Promise<TvPoll>>(),
    continueTvLink:
      vi.fn<(code: string, signal?: AbortSignal) => Promise<TvPoll>>(),
    cancelTvLink: vi.fn<(code: string) => Promise<void>>(),
    signOutTv: vi.fn<(token: string) => Promise<void>>(),
  }));
vi.mock("./tv-link-api", () => ({
  startTvLink,
  pollTvLink,
  continueTvLink,
  cancelTvLink,
  signOutTv,
}));

const REQUEST: TvLinkRequest = {
  deviceCode: "device-code",
  userCode: "ABCD2345",
  verificationUri: "https://graspy.example/link",
  verificationUriComplete: "https://graspy.example/link#code=ABCD2345",
  expiresIn: 600,
  interval: 5,
};
const APPROVAL: TvApproval = {
  token: "session",
  expiresIn: 3600,
  refreshToken: "refresh",
  account: "uid-1",
  learner: { id: "a1b2c3d4e5f6", name: "Ada" },
};

let states: TvLinkState[];
let approved: TvApproval[];

// What the TV knows of itself, which a test sets: whether the page is looked at, when it last
// saw input, and how far its clocks have jumped (a page that was frozen and then resumed).
let visible: boolean;
let inputAt: number | null;
let skew: number;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function run(overrides: Partial<TvLinkDeps> = {}) {
  return runTvLink(
    {
      onState: (state) => states.push(state),
      onApproved: (approval) => approved.push(approval),
    },
    {
      start: startTvLink,
      poll: pollTvLink,
      release: continueTvLink,
      cancel: cancelTvLink,
      signOut: signOutTv,
      now: () => Date.now() + skew,
      mono: () => Date.now() + skew,
      visible: () => visible,
      lastInput: () => inputAt,
      wait,
      ...overrides,
    },
  );
}

const kinds = () => states.map((state) => state.kind);
const secondsPass = (seconds: number) =>
  vi.advanceTimersByTimeAsync(seconds * 1000);

beforeEach(() => {
  vi.useFakeTimers();
  states = [];
  approved = [];
  startTvLink.mockReset().mockResolvedValue(REQUEST);
  pollTvLink.mockReset().mockResolvedValue({ status: "pending" });
  continueTvLink.mockReset();
  cancelTvLink.mockReset().mockResolvedValue(undefined);
  signOutTv.mockReset().mockResolvedValue(undefined);
  visible = true;
  inputAt = Date.now();
  skew = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("asking for a code", () => {
  it("shows the code once it is given, counting from when it arrived", async () => {
    run();
    await secondsPass(0);

    expect(kinds()).toEqual(["starting", "waiting"]);
    expect(states[1]).toMatchObject({
      kind: "waiting",
      request: REQUEST,
      expiresAt: Date.now() + 600_000,
    });
  });

  it("fails when no code can be had", async () => {
    startTvLink.mockRejectedValue(new NetworkError("offline"));
    run();
    await secondsPass(0);

    expect(kinds()).toEqual(["starting", "failed"]);
    expect(pollTvLink).not.toHaveBeenCalled();
  });
});

describe("polling", () => {
  it("polls with the device code at the server's interval, not before", async () => {
    run();
    await secondsPass(4.9);
    expect(pollTvLink).not.toHaveBeenCalled();

    await secondsPass(0.2);
    expect(pollTvLink).toHaveBeenCalledTimes(1);
    expect(pollTvLink.mock.calls[0][0]).toBe("device-code");
    await secondsPass(5);
    expect(pollTvLink).toHaveBeenCalledTimes(2);
  });

  it("waits the longer interval the server asks for on slow_down", async () => {
    pollTvLink
      .mockResolvedValueOnce({ status: "slow_down", interval: 10 })
      .mockResolvedValue({ status: "pending", interval: 10 });
    run();
    await secondsPass(5);
    expect(pollTvLink).toHaveBeenCalledTimes(1);

    await secondsPass(9);
    expect(pollTvLink).toHaveBeenCalledTimes(1);
    await secondsPass(1);
    expect(pollTvLink).toHaveBeenCalledTimes(2);
  });

  it("shows whom it is to be linked to once the phone approves, gives no session yet and stops polling", async () => {
    pollTvLink
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "linking", learner: APPROVAL.learner });
    run();
    await secondsPass(10 + 4.9);

    expect(approved).toEqual([]);
    expect(continueTvLink).not.toHaveBeenCalled();
    expect(pollTvLink).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({
      kind: "linking",
      learnerName: "Ada",
      approver: {},
      auto: true,
      continuesAt: Date.now() - 4_900 + VETO_MS,
      busy: false,
    });
  });

  it("goes on by itself five seconds after the phone approved, with nobody pressing anything", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
    });
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    run();
    await secondsPass(5);
    expect(continueTvLink).not.toHaveBeenCalled();

    await secondsPass(VETO_MS / 1000 - 0.1);
    expect(continueTvLink).not.toHaveBeenCalled();
    await secondsPass(0.2);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(continueTvLink).toHaveBeenCalledWith("device-code");
    expect(approved).toEqual([APPROVAL]);
  });

  it("carries who approved, as the server named them", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    run();
    await secondsPass(6);

    expect(states.at(-1)).toMatchObject({
      kind: "linking",
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
  });

  it.each(["denied", "expired"] as const)("ends on %s", async (status) => {
    pollTvLink.mockResolvedValue({ status });
    run();
    await secondsPass(60);

    expect(kinds().at(-1)).toBe(status);
    expect(pollTvLink).toHaveBeenCalledTimes(1);
    expect(approved).toEqual([]);
  });

  it("expires by its own clock when the code's time is up", async () => {
    run();
    await secondsPass(601);

    expect(kinds().at(-1)).toBe("expired");
    const polls = pollTvLink.mock.calls.length;
    await secondsPass(60);
    expect(pollTvLink).toHaveBeenCalledTimes(polls);
  });
});

describe("a server that cannot be reached", () => {
  it("tries again after pauses that double up to a limit", async () => {
    const times: number[] = [];
    pollTvLink.mockImplementation(async () => {
      times.push(Date.now());
      throw new NetworkError("offline");
    });
    run();
    await secondsPass(5 + 2 + 4 + 8 + 16 + 30 + 30);

    const gaps = times.slice(1).map((at, index) => (at - times[index]) / 1000);
    expect(gaps).toEqual([2, 4, 8, 16, 30, 30]);
  });

  it("goes back to the server's interval once it answers", async () => {
    pollTvLink
      .mockRejectedValueOnce(new NetworkError("offline"))
      .mockResolvedValue({ status: "pending" });
    run();
    await secondsPass(5 + 2);
    expect(pollTvLink).toHaveBeenCalledTimes(2);

    await secondsPass(4.9);
    expect(pollTvLink).toHaveBeenCalledTimes(2);
    await secondsPass(0.2);
    expect(pollTvLink).toHaveBeenCalledTimes(3);
  });

  it("gives up on an answer that will not change, such as a refusal", async () => {
    pollTvLink.mockRejectedValue(new ApiError("Bad request", 400));
    run();
    await secondsPass(60);

    expect(kinds().at(-1)).toBe("failed");
    expect(pollTvLink).toHaveBeenCalledTimes(1);
  });
});

describe("cancelling", () => {
  it("stops polling and reports nothing more", async () => {
    const link = run();
    await secondsPass(5);
    const reported = states.length;

    link.stop();
    await secondsPass(120);

    expect(pollTvLink).toHaveBeenCalledTimes(1);
    expect(states).toHaveLength(reported);
  });

  it("passes the poll a signal that cancelling aborts", async () => {
    const signals: AbortSignal[] = [];
    pollTvLink.mockImplementation(async (_code, signal) => {
      if (signal) signals.push(signal);
      return { status: "pending" };
    });
    const link = run();
    await secondsPass(5);

    link.stop();

    expect(signals[0].aborted).toBe(true);
  });

  it("reports no code if cancelled while one is being asked for", async () => {
    let give: (request: TvLinkRequest) => void = () => undefined;
    startTvLink.mockReturnValue(new Promise((resolve) => (give = resolve)));
    const link = run();
    link.stop();
    give(REQUEST);
    await secondsPass(10);

    expect(kinds()).toEqual(["starting"]);
    expect(pollTvLink).not.toHaveBeenCalled();
  });
});

describe("the person at the TV confirms", () => {
  async function linking() {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
    });
    const link = run();
    await secondsPass(5);
    return link;
  }

  it("is given the session only by the call to continue, and a second one finds nothing to do", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = await linking();

    link.confirm();
    await secondsPass(0);
    link.confirm();
    await secondsPass(VETO_MS / 1000 + 1);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(approved).toEqual([APPROVAL]);
    expect(states.at(-1)).toMatchObject({ kind: "linking", busy: true });
  });

  it("declining inside the five seconds stops it from going on", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = await linking();

    await secondsPass(3);
    link.decline();
    await secondsPass(60);

    expect(continueTvLink).not.toHaveBeenCalled();
    expect(approved).toEqual([]);
    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(states.at(-1)).toEqual({ kind: "declined" });
  });

  it("leaving the screen inside the five seconds cancels the request and does not go on", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = await linking();

    link.stop();
    await secondsPass(60);

    expect(continueTvLink).not.toHaveBeenCalled();
    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
  });

  it("is not cancelled at the server once it has its session", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = await linking();
    link.confirm();
    await secondsPass(0);

    link.stop();

    expect(cancelTvLink).not.toHaveBeenCalled();
  });

  it("declines: nothing is given, the request is cancelled and the screen says so", async () => {
    const link = await linking();

    link.decline();
    await secondsPass(60);

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(continueTvLink).not.toHaveBeenCalled();
    expect(approved).toEqual([]);
    expect(states.at(-1)).toEqual({ kind: "declined" });
  });

  it("cannot continue after declining", async () => {
    const link = await linking();
    link.decline();

    link.confirm();

    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("cannot continue before the phone approved", async () => {
    const link = run();
    await secondsPass(1);

    link.confirm();

    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it.each(["denied", "expired"] as const)(
    "ends on %s when the server says so",
    async (status) => {
      continueTvLink.mockResolvedValue({ status });
      const link = await linking();

      link.confirm();
      await secondsPass(0);

      expect(approved).toEqual([]);
      expect(states.at(-1)).toEqual({ kind: status });
    },
  );

  it("keeps the request when the account is full, and lets the person continue again", async () => {
    continueTvLink
      .mockResolvedValueOnce({ status: "full" })
      .mockResolvedValueOnce({ status: "approved", ...APPROVAL });
    const link = await linking();

    link.confirm();
    await secondsPass(0);
    expect(states.at(-1)).toEqual({ kind: "full" });
    expect(approved).toEqual([]);
    expect(cancelTvLink).not.toHaveBeenCalled();
    link.confirm();
    await secondsPass(0);

    expect(approved).toEqual([APPROVAL]);
  });

  it("fails when the session cannot be had", async () => {
    continueTvLink.mockRejectedValue(new NetworkError("offline"));
    const link = await linking();

    link.confirm();
    await secondsPass(0);

    expect(states.at(-1)).toEqual({ kind: "failed" });
  });
});

describe("a request that is left", () => {
  it("is cancelled at the server when the screen is left or a new code is asked for", async () => {
    const link = run();
    await secondsPass(6);

    link.stop();

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
  });

  it("is not cancelled when it already ended", async () => {
    pollTvLink.mockResolvedValue({ status: "expired" });
    const link = run();
    await secondsPass(6);

    link.stop();

    expect(cancelTvLink).not.toHaveBeenCalled();
  });

  it("is cancelled when the screen is left while the person is asked to confirm", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
    });
    const link = run();
    await secondsPass(6);

    link.stop();

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
  });

  it("has nothing to cancel before it has a code", async () => {
    startTvLink.mockReturnValue(new Promise(() => undefined));
    const link = run();

    link.stop();

    expect(cancelTvLink).not.toHaveBeenCalled();
  });
});

describe("going on by itself only when someone is at the TV", () => {
  const approvedBy = () =>
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
    });

  it("goes on when the TV saw input just before the approval and is visible", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    approvedBy();
    inputAt = Date.now() + 4_000;
    run();

    await secondsPass(5 + 5.1);

    expect(states.find((state) => state.kind === "linking")).toMatchObject({
      auto: true,
    });
    expect(approved).toEqual([APPROVAL]);
  });

  it("does not call the server when the TV saw no input for three minutes: it shows Continue and waits", async () => {
    approvedBy();
    inputAt = Date.now() - 3 * 60_000;
    const link = run();

    await secondsPass(5 + 60);

    expect(states.at(-1)).toMatchObject({
      kind: "linking",
      auto: false,
      continuesAt: null,
      busy: false,
    });
    expect(continueTvLink).not.toHaveBeenCalled();
    expect(approved).toEqual([]);

    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    link.confirm();
    await secondsPass(0);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(approved).toEqual([APPROVAL]);
  });

  it("does not go on when the input was just over two minutes before the approval", async () => {
    approvedBy();
    inputAt = Date.now() - PRESENCE_MS + 4_000;
    run();

    await secondsPass(5 + 10);

    expect(states.at(-1)).toMatchObject({ auto: false });
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("goes on for input just under two minutes old", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    approvedBy();
    inputAt = Date.now() - PRESENCE_MS + 10_000;
    run();

    await secondsPass(5 + 5.1);

    expect(approved).toEqual([APPROVAL]);
  });

  it("does not go on for a TV that has seen no input at all", async () => {
    approvedBy();
    inputAt = null;
    run();

    await secondsPass(5 + 30);

    expect(states.at(-1)).toMatchObject({ auto: false });
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("does not go on when the page is hidden at the approval", async () => {
    approvedBy();
    visible = false;
    run();

    await secondsPass(5 + 30);

    expect(states.at(-1)).toMatchObject({ auto: false });
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("does not go on when the page is hidden as the timer fires, and shows Continue", async () => {
    approvedBy();
    run();
    await secondsPass(5);
    expect(states.at(-1)).toMatchObject({ auto: true });

    visible = false;
    await secondsPass(VETO_MS / 1000 + 0.1);

    expect(continueTvLink).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      kind: "linking",
      auto: false,
      continuesAt: null,
    });
  });

  it("does not go on when the timer fires far later than it was set for: the page was not running", async () => {
    approvedBy();
    run();
    await secondsPass(5);

    // Frozen for ten seconds and resumed: the clocks jumped, the timer fires late.
    skew = VETO_MS + OVERSHOOT_MS + 1_000;
    await secondsPass(VETO_MS / 1000 + 0.1);

    expect(continueTvLink).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ auto: false, continuesAt: null });
  });

  it("goes on when the timer is a little late, within what a busy TV does", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    approvedBy();
    run();
    await secondsPass(5);

    skew = OVERSHOOT_MS - 500;
    await secondsPass(VETO_MS / 1000 + 0.1);

    expect(approved).toEqual([APPROVAL]);
  });

  it("checks the monotonic clock too, which a changed wall clock cannot hide", async () => {
    approvedBy();
    let mono = 0;
    run({ mono: () => mono });
    await secondsPass(5);

    mono = VETO_MS + OVERSHOOT_MS + 1_000;
    await secondsPass(VETO_MS / 1000 + 0.1);

    expect(continueTvLink).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ auto: false });
  });

  it("shows no countdown deadline when it waits for the person, and the request still expires as before", async () => {
    approvedBy();
    inputAt = null;
    run();

    await secondsPass(10 * 60 + 5);

    expect(states.at(-1)).toMatchObject({ kind: "linking", auto: false });
    expect(continueTvLink).not.toHaveBeenCalled();
  });
});

describe("the session being given", () => {
  function approvedAndLinking() {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: APPROVAL.learner,
    });
    const link = run();
    return link;
  }

  /** A release that is answered when the test says so. */
  function pendingRelease() {
    let answer: (poll: TvPoll) => void = () => undefined;
    continueTvLink.mockReturnValue(
      new Promise((resolve) => (answer = resolve)),
    );
    return (poll: TvPoll) => answer(poll);
  }

  it("is asked for once when confirm is called twice without waiting", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5);

    link.confirm();
    link.confirm();
    link.confirm();
    answer({ status: "approved", ...APPROVAL });
    await secondsPass(0);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(approved).toEqual([APPROVAL]);
  });

  it("is asked for once when the timer and a press come together", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.confirm();
    answer({ status: "approved", ...APPROVAL });
    await secondsPass(0);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(approved).toEqual([APPROVAL]);
  });

  it("never ends as expired after the first succeeded, however often it is asked", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = approvedAndLinking();
    await secondsPass(5);

    link.confirm();
    await secondsPass(0);
    link.confirm();
    link.confirm();
    await secondsPass(0);

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(states.some((state) => state.kind === "expired")).toBe(false);
    expect(approved).toEqual([APPROVAL]);
  });

  it("declined after the timer fired waits for the result, and signs the credential out instead of cancelling", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);
    expect(continueTvLink).toHaveBeenCalledTimes(1);

    link.decline();
    expect(states.at(-1)).toMatchObject({ kind: "linking", busy: true });
    expect(cancelTvLink).not.toHaveBeenCalled();
    answer({ status: "approved", ...APPROVAL });
    await secondsPass(0);

    expect(signOutTv).toHaveBeenCalledWith("refresh");
    expect(cancelTvLink).not.toHaveBeenCalled();
    expect(approved).toEqual([]);
    expect(states.at(-1)).toEqual({ kind: "declined" });
  });

  it("does not show the screen as declined while the session is still being given", async () => {
    pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.decline();
    await secondsPass(30);

    expect(states.some((state) => state.kind === "declined")).toBe(false);
  });

  it("leaves nothing made when it is declined while being given and the answer is that it is not", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.decline();
    answer({ status: "denied" });
    await secondsPass(0);

    expect(signOutTv).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ kind: "declined" });
  });

  it("cancels the request when it is declined while being given and the account was full", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.decline();
    answer({ status: "full" });
    await secondsPass(0);

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(states.at(-1)).toEqual({ kind: "declined" });
  });

  it("is a no-op to decline after it succeeded", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.decline();
    await secondsPass(0);

    expect(signOutTv).not.toHaveBeenCalled();
    expect(cancelTvLink).not.toHaveBeenCalled();
    expect(states.at(-1)).not.toEqual({ kind: "declined" });
    expect(approved).toEqual([APPROVAL]);
  });

  it("leaving the screen (Back) while it is being given signs the credential out and does not orphan it", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.stop();
    answer({ status: "approved", ...APPROVAL });
    await secondsPass(0);

    expect(signOutTv).toHaveBeenCalledWith("refresh");
    expect(approved).toEqual([]);
    expect(cancelTvLink).not.toHaveBeenCalled();
  });

  it("does not abort the request for the session when the screen is left", async () => {
    pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.stop();

    expect(continueTvLink).toHaveBeenCalledTimes(1);
    expect(continueTvLink.mock.calls[0]).toEqual(["device-code"]);
  });

  it("signs nothing out when the screen is left and the session was not given", async () => {
    const answer = pendingRelease();
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.stop();
    answer({ status: "expired" });
    await secondsPass(0);

    expect(signOutTv).not.toHaveBeenCalled();
  });

  it("is not signed out when it was given and the screen is left only afterwards", async () => {
    continueTvLink.mockResolvedValue({ status: "approved", ...APPROVAL });
    const link = approvedAndLinking();
    await secondsPass(5 + VETO_MS / 1000 + 0.1);

    link.stop();
    await secondsPass(0);

    expect(signOutTv).not.toHaveBeenCalled();
    expect(cancelTvLink).not.toHaveBeenCalled();
  });
});
