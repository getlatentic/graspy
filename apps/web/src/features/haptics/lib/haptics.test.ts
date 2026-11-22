// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vibrate = vi.fn(() => true);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function setBrowser({ reduced = false, activation = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
  }));
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: activation ? { hasBeenActive: true } : undefined,
  });
}

async function load() {
  vi.resetModules();
  window.localStorage.clear();
  return (await import("./haptics")).haptics;
}

beforeEach(() => {
  vibrate.mockClear();
  setVisibility("visible");
});
afterEach(() => vi.unstubAllGlobals());

describe("the browser's haptics", () => {
  it("vibrates once the browser says the learner has acted", async () => {
    setBrowser({ activation: true });
    (await load()).trigger("correct");
    expect(vibrate).toHaveBeenCalledWith([35]);
  });

  it("waits for a touch where the browser cannot say", async () => {
    setBrowser();
    const haptics = await load();
    haptics.trigger("correct");
    expect(vibrate).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("pointerdown"));
    haptics.trigger("correct");
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("is silent under reduced motion", async () => {
    setBrowser({ reduced: true, activation: true });
    (await load()).trigger("correct");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("is silent in a hidden page, and stops a pattern as the page hides", async () => {
    setBrowser({ activation: true });
    const haptics = await load();
    setVisibility("hidden");
    haptics.trigger("correct");
    expect(vibrate).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vibrate).toHaveBeenCalledWith(0);
  });

  it("is silent once the learner has turned it off", async () => {
    setBrowser({ activation: true });
    const haptics = await load();
    const { setSettings } = await import("./haptic-settings");
    setSettings({ enabled: false });
    haptics.trigger("correct");
    expect(vibrate).not.toHaveBeenCalled();
  });
});
