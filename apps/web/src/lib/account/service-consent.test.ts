import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isServiceConsentKey,
  keepServiceConsent,
  serviceConsentKept,
} from "./service-consent";

function browserStorage() {
  const kept = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    },
  });
  return kept;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  browserStorage();
});

describe("a parent's agreement, as the device remembers it", () => {
  it("is not held until the server has said so", () => {
    expect(serviceConsentKept("uid-1", "ada")).toBe(false);
  });

  it("is held for that account's learner and no other", () => {
    keepServiceConsent("uid-1", "ada");

    expect(serviceConsentKept("uid-1", "ada")).toBe(true);
    expect(serviceConsentKept("uid-1", "grace")).toBe(false);
    expect(serviceConsentKept("uid-2", "ada")).toBe(false);
  });

  it("is told apart from the device's other keys", () => {
    const kept = browserStorage();
    keepServiceConsent("uid-1", "ada");

    const [key] = [...kept.keys()];
    expect(isServiceConsentKey(key)).toBe(true);
    expect(isServiceConsentKey("graspy.account")).toBe(false);
  });

  it("is not held when storage refuses", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    });

    expect(() => keepServiceConsent("uid-1", "ada")).not.toThrow();
    expect(serviceConsentKept("uid-1", "ada")).toBe(false);
  });
});
