// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitToAskAgain } from "./learner-route-follow";

vi.mock("@/lib/mcp/server", () => ({ callAppTool: vi.fn() }));

/** Whether the wait is over once pending callbacks have run. */
async function isOver(wait: Promise<void>): Promise<boolean> {
  let over = false;
  void wait.then(() => (over = true));
  await vi.advanceTimersByTimeAsync(0);
  return over;
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("waitToAskAgain", () => {
  it("is over once the delay has passed, and not before", async () => {
    const wait = waitToAskAgain(2_000, new AbortController().signal);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(await isOver(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await isOver(wait)).toBe(true);
  });

  it("is over as soon as the device is back online", async () => {
    const wait = waitToAskAgain(30_000, new AbortController().signal);

    window.dispatchEvent(new Event("online"));

    expect(await isOver(wait)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is over when stopped, and leaves no timer or listener behind", async () => {
    const stop = new AbortController();
    const unlisten = vi.spyOn(window, "removeEventListener");
    const wait = waitToAskAgain(30_000, stop.signal);

    stop.abort();

    expect(await isOver(wait)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(unlisten).toHaveBeenCalledWith("online", expect.any(Function));
  });

  it("does not wait at all when already stopped", async () => {
    const stop = new AbortController();
    stop.abort();
    const listen = vi.spyOn(window, "addEventListener");

    const wait = waitToAskAgain(30_000, stop.signal);

    expect(await isOver(wait)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(listen).not.toHaveBeenCalled();
  });
});
