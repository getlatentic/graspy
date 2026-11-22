// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseSettings,
  setSettings,
  subscribeSettings,
} from "./haptic-settings";

afterEach(() => window.localStorage.clear());

describe("the haptic settings", () => {
  it("are on until the learner turns them off", () => {
    expect(parseSettings(null)).toEqual({ enabled: true });
    expect(parseSettings('{"enabled":false}')).toEqual({ enabled: false });
  });

  it("fall back to the default for anything that is not a setting", () => {
    for (const raw of ["", "nope", "[]", "{}", '{"enabled":"no"}', "3"]) {
      expect(parseSettings(raw)).toBe(DEFAULT_SETTINGS);
    }
  });

  it("follow another tab's choice and tell whoever is listening", () => {
    setSettings({ enabled: true });
    const heard = vi.fn();
    const stop = subscribeSettings(heard);

    window.localStorage.setItem("graspy.haptics", '{"enabled":false}');
    window.dispatchEvent(
      new StorageEvent("storage", { key: "graspy.haptics" }),
    );
    expect(getSettings()).toEqual({ enabled: false });
    expect(heard).toHaveBeenCalledOnce();

    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(heard).toHaveBeenCalledOnce();

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(getSettings()).toEqual({ enabled: true });
    stop();
  });
});
