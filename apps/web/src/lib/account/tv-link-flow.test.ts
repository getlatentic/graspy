import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { runTvLink, type TvLinkState } from "./tv-link-flow";
import type { TvApproval, TvLinkRequest, TvPoll } from "./tv-link-api";

const { startTvLink, pollTvLink } = vi.hoisted(() => ({
  startTvLink: vi.fn<(signal?: AbortSignal) => Promise<TvLinkRequest>>(),
  pollTvLink: vi.fn<(code: string, signal?: AbortSignal) => Promise<TvPoll>>(),
}));
vi.mock("./tv-link-api", () => ({ startTvLink, pollTvLink }));

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

function run() {
  return runTvLink({
    onState: (state) => states.push(state),
    onApproved: (approval) => approved.push(approval),
  });
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

  it("signs in once the phone approves, and stops polling", async () => {
    pollTvLink
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "approved", ...APPROVAL });
    run();
    await secondsPass(60);

    expect(approved).toEqual([APPROVAL]);
    expect(pollTvLink).toHaveBeenCalledTimes(2);
    expect(kinds()).toEqual(["starting", "waiting"]);
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
    const stop = run();
    await secondsPass(5);
    const reported = states.length;

    stop();
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
    const stop = run();
    await secondsPass(5);

    stop();

    expect(signals[0].aborted).toBe(true);
  });

  it("reports no code if cancelled while one is being asked for", async () => {
    let give: (request: TvLinkRequest) => void = () => undefined;
    startTvLink.mockReturnValue(new Promise((resolve) => (give = resolve)));
    const stop = run();
    stop();
    give(REQUEST);
    await secondsPass(10);

    expect(kinds()).toEqual(["starting"]);
    expect(pollTvLink).not.toHaveBeenCalled();
  });
});
