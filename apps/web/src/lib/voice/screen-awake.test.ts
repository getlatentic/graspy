// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepScreenOn } from "./screen-awake";
import { fakeWakeLock, noWakeLock } from "./wake-lock.fake";

const settled = () => new Promise((resolve) => setTimeout(resolve));

describe("keepScreenOn", () => {
  it("holds a screen wake lock until it is let go", async () => {
    const wakeLock = fakeWakeLock();

    const letSleep = keepScreenOn();
    await settled();

    expect(wakeLock.request).toHaveBeenCalledWith("screen");
    expect(wakeLock.release).not.toHaveBeenCalled();
    letSleep();
    expect(wakeLock.release).toHaveBeenCalledOnce();
  });

  it("lets a lock granted after it was let go go at once", async () => {
    const wakeLock = fakeWakeLock();

    keepScreenOn()();
    await settled();

    expect(wakeLock.release).toHaveBeenCalledOnce();
  });

  it("does without where the browser refuses one", async () => {
    const wakeLock = fakeWakeLock("refuse");

    const letSleep = keepScreenOn();
    await settled();
    letSleep();

    expect(wakeLock.request).toHaveBeenCalledOnce();
    expect(wakeLock.release).not.toHaveBeenCalled();
  });

  it("does without where the browser has none", () => {
    noWakeLock();

    expect(() => keepScreenOn()()).not.toThrow();
  });
});
