import { beforeEach, describe, expect, it, vi } from "vitest";
import { markVoiceNoteSeen, voiceNoteSeen } from "./voice-consent";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
});

describe("the voice note", () => {
  it("shows once per learner, and not again", () => {
    expect(voiceNoteSeen("uid/ada")).toBe(false);
    markVoiceNoteSeen("uid/ada");
    expect(voiceNoteSeen("uid/ada")).toBe(true);
    expect(voiceNoteSeen("uid/grace")).toBe(false);
  });
});
