// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkedTurn } from "@/lib/voice/voice-types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const turn: MarkedTurn = {
  sample_id: "s1",
  state: "complete",
  transcript: "three",
  decision: "correct",
  feedback: "Well done.",
  provider: "test",
  latency_ms: 1,
};

describe("a shown result", () => {
  it("is never felt or heard by showing it, nor by showing it again", async () => {
    // The outputs are the device's own: a vibration motor, audio, a fetch. A call to
    // anything under haptics, whatever it is named, would reach one of them.
    const vibrate = vi.fn(() => true);
    const contexts: object[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          contexts.push(this);
        }
      },
    );
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: true },
    });
    vi.resetModules();
    const { haptics } = await import("@/features/haptics/lib/haptics");
    const { TurnResult } = await import("./turn-result");
    const { KeysApp } = await import("@/test/keys-app");
    const methods = (["trigger", "wake", "stop"] as const).map((name) =>
      vi.spyOn(haptics, name),
    );

    const { rerender, unmount } = render(
      <KeysApp>
        <TurnResult turn={turn} />
      </KeysApp>,
    );
    rerender(
      <KeysApp>
        <TurnResult turn={{ ...turn, decision: "try_again" }} />
      </KeysApp>,
    );
    unmount();
    render(
      <KeysApp>
        <TurnResult turn={turn} />
      </KeysApp>,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    for (const method of methods) expect(method).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
    delete (navigator as { vibrate?: unknown }).vibrate;
    delete (navigator as { userActivation?: unknown }).userActivation;
  });
});
