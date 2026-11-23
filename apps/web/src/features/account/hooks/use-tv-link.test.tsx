// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetInput, noteInput, sinceInput } from "@/lib/account/tv-presence";

const { startTvLink, pollTvLink } = vi.hoisted(() => ({
  startTvLink: vi.fn(),
  pollTvLink: vi.fn(),
}));
vi.mock("@/lib/account/tv-link-api", () => ({
  startTvLink,
  pollTvLink,
  continueTvLink: vi.fn(),
  cancelTvLink: vi.fn(async () => undefined),
  signOutTv: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/session", () => ({ startTvSession: vi.fn() }));

import { useTvLink } from "./use-tv-link";

beforeEach(() => {
  vi.useFakeTimers();
  forgetInput();
  startTvLink.mockReset().mockResolvedValue({
    deviceCode: "device-code",
    userCode: "ABCD2345",
    verificationUri: "https://graspy.example/link",
    verificationUriComplete: "https://graspy.example/link#code=ABCD2345",
    expiresIn: 600,
    interval: 5,
  });
  pollTvLink.mockReset().mockResolvedValue({ status: "pending" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("presence from the hook that runs the flow", () => {
  it("is not given by the screen opening: a boot, a redirect or a session failure lands here too", async () => {
    renderHook(() => useTvLink());
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(sinceInput()).toBeNull();
  });

  it("keeps what the press that opened the screen gave, which is noted by that press and not by the hook", async () => {
    noteInput();
    vi.advanceTimersByTime(1_000);

    renderHook(() => useTvLink());
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(sinceInput()).toBe(1_010);
  });

  it("is not renewed by a new code asked for with no event, as an automatic restart does", async () => {
    const { result } = renderHook(() => useTvLink());
    await act(() => vi.advanceTimersByTimeAsync(10));

    await act(async () => result.current.again());
    await act(async () => result.current.again({ isTrusted: false }));

    expect(sinceInput()).toBeNull();
    expect(startTvLink).toHaveBeenCalledTimes(3);
  });

  it("is renewed by a new code asked for by a press of a person", async () => {
    const { result } = renderHook(() => useTvLink());
    await act(() => vi.advanceTimersByTimeAsync(10));

    await act(async () => result.current.again({ isTrusted: true }));

    expect(sinceInput()).toBe(0);
  });

  it("notes real input that comes while the screen is open", async () => {
    renderHook(() => useTvLink());
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(sinceInput()).toBeNull();

    // A person's key press: the tracker the hook installed is what notes it. A script's is not.
    document.dispatchEvent(new Event("keydown", { bubbles: true }));

    expect(sinceInput()).toBeNull();
  });
});
