import { afterEach, describe, expect, it, vi } from "vitest";
import { whenIdle } from "./when-idle";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("whenIdle", () => {
  it("waits for the page to load, then for an idle moment", async () => {
    let loaded: () => void = () => undefined;
    let idle: () => void = () => undefined;
    vi.stubGlobal("document", { readyState: "loading" });
    vi.stubGlobal("window", {
      addEventListener: (_: string, listener: () => void) => (loaded = listener),
      requestIdleCallback: (callback: () => void) => (idle = callback),
    });
    let over = false;
    void whenIdle().then(() => (over = true));
    await Promise.resolve();
    expect(over).toBe(false);
    loaded();
    await Promise.resolve();
    expect(over).toBe(false);
    idle();
    await Promise.resolve();
    expect(over).toBe(true);
  });

  it("waits a short while where there is no idle callback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { readyState: "complete" });
    vi.stubGlobal("window", {});
    let over = false;
    void whenIdle().then(() => (over = true));
    await vi.advanceTimersByTimeAsync(100);
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(over).toBe(true);
  });
});
