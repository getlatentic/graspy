// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_MS, useSlow } from "./use-slow";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useSlow", () => {
  it("is false until the wait has lasted the time, then true", () => {
    const { result } = renderHook(() => useSlow(true));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(SLOW_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("is about eight seconds, for a server that takes seven to start", () => {
    expect(SLOW_MS).toBe(8_000);
  });

  it("never fires for a wait that ends in time", () => {
    const { result, rerender } = renderHook(({ waiting }) => useSlow(waiting), {
      initialProps: { waiting: true },
    });
    act(() => vi.advanceTimersByTime(SLOW_MS - 1));
    rerender({ waiting: false });
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(result.current).toBe(false);
  });

  it("starts the count again for a new wait", () => {
    const { result, rerender } = renderHook(({ waiting }) => useSlow(waiting), {
      initialProps: { waiting: true },
    });
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(result.current).toBe(true);
    rerender({ waiting: false });
    expect(result.current).toBe(false);
    rerender({ waiting: true });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(result.current).toBe(true);
  });
});
