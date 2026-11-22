import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytes } from "./fetch-bytes";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const bytes = new Uint8Array([1, 2, 3]).buffer;

describe("fetchBytes", () => {
  it("returns the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes,
      })),
    );
    expect(await fetchBytes("/sounds/a.wav", 1000)).toBe(bytes);
  });

  it("rejects on a reply that is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(fetchBytes("/sounds/a.wav", 1000)).rejects.toThrow("404");
  });

  it("gives up when nothing arrives, with no AbortSignal.timeout (Chromium before 103, Safari before 16)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "AbortSignal",
      class extends EventTarget {} as unknown as typeof AbortSignal,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const outcome = expect(fetchBytes("/sounds/a.wav", 1000)).rejects.toThrow(
      "aborted",
    );
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
  });

  it("leaves no timer behind once it has the body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes,
      })),
    );
    await fetchBytes("/sounds/a.wav", 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
