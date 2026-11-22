// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { markDevice } from "./device";

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.device;
  window.history.pushState({}, "", "/");
});

const blockStorage = () =>
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });

describe("markDevice", () => {
  it("does not throw where reading localStorage itself throws, and still marks a TV by its agent", () => {
    blockStorage();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) TV Safari/537.36",
    );
    expect(() => markDevice()).not.toThrow();
    expect(document.documentElement.dataset.device).toBe("tv");
  });

  it("marks nothing for a desktop, and ?tv=1 marks it even with storage blocked", () => {
    blockStorage();
    markDevice();
    expect(document.documentElement.dataset.device).toBeUndefined();
    window.history.pushState({}, "", "/?tv=1");
    markDevice();
    expect(document.documentElement.dataset.device).toBe("tv");
  });
});
