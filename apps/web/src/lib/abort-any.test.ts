import { afterEach, describe, expect, it, vi } from "vitest";
import { abortAny } from "./abort-any";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** AbortSignal as Chromium 108 has it: no `any`. */
function stubChromium108() {
  vi.stubGlobal("AbortSignal", {
    abort: AbortSignal.abort.bind(AbortSignal),
    timeout: AbortSignal.timeout.bind(AbortSignal),
  });
}

describe.each([
  ["with AbortSignal.any", () => {}],
  ["without AbortSignal.any (Chromium 108)", stubChromium108],
])("abortAny %s", (_name, setup) => {
  it("stays open until one of the signals aborts, then carries its reason", () => {
    setup();
    const a = new AbortController();
    const b = new AbortController();
    const merged = abortAny([a.signal, b.signal]);
    expect(merged.aborted).toBe(false);
    b.abort("second");
    expect(merged.aborted).toBe(true);
    expect(merged.reason).toBe("second");
  });

  it("is aborted at once when a signal already is", () => {
    setup();
    const a = new AbortController();
    a.abort("early");
    const merged = abortAny([new AbortController().signal, a.signal]);
    expect(merged.aborted).toBe(true);
    expect(merged.reason).toBe("early");
  });

  it("follows a timeout signal", async () => {
    setup();
    const merged = abortAny([
      new AbortController().signal,
      AbortSignal.timeout(10),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(merged.aborted).toBe(true);
  });
});

it("aborts once and lets go of the other signals", () => {
  stubChromium108();
  const a = new AbortController();
  const b = new AbortController();
  const merged = abortAny([a.signal, b.signal]);
  const onAbort = vi.fn();
  merged.addEventListener("abort", onAbort);
  a.abort();
  b.abort();
  expect(onAbort).toHaveBeenCalledTimes(1);
});
