// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMicrophone, showPage } from "./microphone.fake";
import { isQuiet, onHold } from "./quiet";
import { startTake } from "./recorder";
import { fakeWakeLock, noWakeLock } from "./wake-lock.fake";

let microphone: ReturnType<typeof fakeMicrophone>;

beforeEach(() => {
  showPage("visible");
  microphone = fakeMicrophone();
  noWakeLock();
});
afterEach(() => vi.unstubAllGlobals());

describe("the app's own sounds during a take", () => {
  it("keep quiet from when the microphone opens until the take ends", async () => {
    expect(isQuiet()).toBe(false);
    const take = await startTake(() => undefined);
    expect(isQuiet()).toBe(true);
    take.cancel();
    await take.done;
    expect(isQuiet()).toBe(false);
  });

  it("are held before the microphone opens, and a cue already sounding is cut at once", async () => {
    const cut = vi.fn();
    const stopListening = onHold(cut);
    const allow = microphone.ask();
    const opening = startTake(() => undefined);
    expect(isQuiet()).toBe(true);
    expect(cut).toHaveBeenCalledOnce();
    allow();
    const take = await opening;
    expect(isQuiet()).toBe(true);
    take.cancel();
    await take.done;
    stopListening();
  });

  it("are released when the microphone is refused", async () => {
    microphone.refuse();
    await expect(startTake(() => undefined)).rejects.toThrow("denied");
    expect(isQuiet()).toBe(false);
  });

  it("come back when the take is ended by the page hiding", async () => {
    const take = await startTake(() => undefined);
    showPage("hidden");
    await take.done;
    expect(isQuiet()).toBe(false);
  });
});

describe("a take out of sight", () => {
  it("ends unsent and releases the microphone when the tab is hidden", async () => {
    const take = await startTake(() => undefined);
    microphone.speak(5);

    showPage("hidden");

    expect(microphone.track.stop).toHaveBeenCalledOnce();
    expect(microphone.closed).toHaveBeenCalledOnce();
    expect(await take.done).toEqual({ kind: "cancelled" });
  });

  it("ends unsent when the page is left", async () => {
    const take = await startTake(() => undefined);
    microphone.speak(5);

    window.dispatchEvent(new Event("pagehide"));

    expect(microphone.track.stop).toHaveBeenCalledOnce();
    expect(await take.done).toEqual({ kind: "cancelled" });
  });

  it("is closed at once when the microphone opens after the tab was hidden", async () => {
    showPage("hidden");

    const take = await startTake(() => undefined);

    expect(microphone.track.stop).toHaveBeenCalledOnce();
    expect(await take.done).toEqual({ kind: "cancelled" });
  });

  it("keeps an answer that had already ended", async () => {
    const take = await startTake(() => undefined);
    microphone.speak(5);
    take.stop();

    showPage("hidden");
    window.dispatchEvent(new Event("pagehide"));

    expect((await take.done).kind).toBe("answer");
    expect(microphone.track.stop).toHaveBeenCalledOnce();
  });

  it("goes on when the tab is shown again", async () => {
    const take = await startTake(() => undefined);
    microphone.speak(5);

    showPage("visible");
    take.stop();

    expect((await take.done).kind).toBe("answer");
  });
});

describe("the screen during a take", () => {
  const settled = () => new Promise((resolve) => setTimeout(resolve));

  it("is kept on while the child speaks, and let sleep once the answer ends", async () => {
    const wakeLock = fakeWakeLock();
    const take = await startTake(() => undefined);
    await settled();
    expect(wakeLock.request).toHaveBeenCalledWith("screen");
    expect(wakeLock.release).not.toHaveBeenCalled();

    microphone.speak(5);
    take.stop();

    expect(wakeLock.release).toHaveBeenCalledOnce();
  });

  it("is let sleep when the take is cancelled", async () => {
    const wakeLock = fakeWakeLock();
    const take = await startTake(() => undefined);
    await settled();

    take.cancel();

    expect(wakeLock.release).toHaveBeenCalledOnce();
  });

  it("keeps its own timeout where the browser has no wake lock", async () => {
    const take = await startTake(() => undefined);
    microphone.speak(5);
    take.stop();

    expect((await take.done).kind).toBe("answer");
  });
});
