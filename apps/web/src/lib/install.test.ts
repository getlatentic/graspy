import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissInstall,
  install,
  INSTALL_DISMISSED_KEY,
  installOffer,
  isIosBrowser,
  listenForInstall,
  offerFor,
  subscribeToInstall,
} from "./install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const INSTAGRAM_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI = IPAD_DESKTOP_MODE;

describe("isIosBrowser", () => {
  it.each([
    ["Safari on an iPhone", IPHONE_SAFARI, "iPhone", 5, true],
    [
      "Safari on an iPad asking for the desktop site",
      IPAD_DESKTOP_MODE,
      "MacIntel",
      5,
      true,
    ],
    [
      "a web view inside another iPhone app",
      INSTAGRAM_ON_IPHONE,
      "iPhone",
      5,
      false,
    ],
    [
      "Firefox on an iPhone",
      IPHONE_SAFARI.replace("Version/18.0", "FxiOS/130.0"),
      "iPhone",
      5,
      false,
    ],
    [
      "the Google app on an iPhone",
      IPHONE_SAFARI + " GSA/300.0",
      "iPhone",
      5,
      false,
    ],
    [
      "Facebook's web view that keeps Safari in its agent",
      IPHONE_SAFARI + " [FBAN/FBIOS;FBAV/450.0]",
      "iPhone",
      5,
      false,
    ],
    ["Chrome on Android", ANDROID_CHROME, "Linux armv8l", 5, false],
    ["Safari on a Mac", MAC_SAFARI, "MacIntel", 0, false],
  ])("%s", (_name, userAgent, platform, maxTouchPoints, expected) => {
    expect(isIosBrowser({ userAgent, platform, maxTouchPoints })).toBe(
      expected,
    );
  });
});

describe("offerFor", () => {
  const open = {
    installed: false,
    dismissed: false,
    hasPrompt: false,
    iosBrowser: false,
  };

  it("offers the browser's install where it gave the event", () => {
    expect(offerFor({ ...open, hasPrompt: true })).toBe("prompt");
  });

  it("gives the steps on iOS, where there is no event", () => {
    expect(offerFor({ ...open, iosBrowser: true })).toBe("steps");
  });

  it("offers nothing in a browser that cannot install", () => {
    expect(offerFor(open)).toBeNull();
  });

  it("offers nothing in the installed app, or once dismissed", () => {
    const both = { ...open, hasPrompt: true, iosBrowser: true };
    expect(offerFor({ ...both, installed: true })).toBeNull();
    expect(offerFor({ ...both, dismissed: true })).toBeNull();
  });
});

describe("the page's install state", () => {
  type Handler = (event: Event) => void;
  const handlers: Record<string, Handler> = {};
  let stored: Record<string, string>;
  let standalone: boolean;

  function browser(userAgent: string) {
    stored = {};
    standalone = false;
    for (const name of Object.keys(handlers)) delete handlers[name];
    vi.stubGlobal("window", {
      addEventListener: (name: string, handler: Handler) => {
        handlers[name] = handler;
      },
      localStorage: {
        getItem: (key: string) => stored[key] ?? null,
        setItem: (key: string, value: string) => {
          stored[key] = value;
        },
      },
    });
    vi.stubGlobal("navigator", { userAgent, platform: "x", maxTouchPoints: 0 });
    vi.stubGlobal("matchMedia", () => ({ matches: standalone }));
  }

  function installEvent(outcome: "accepted" | "dismissed") {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    return Object.assign(event, {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome }),
    });
  }

  beforeEach(() => {
    browser(ANDROID_CHROME);
    // Each test starts as a fresh page: nothing kept, nothing offered.
    listenForInstall();
    handlers.appinstalled(new Event("appinstalled"));
    stored = {};
  });

  it("keeps Chrome's event, stops its own bar, and offers the install", () => {
    listenForInstall();
    const event = installEvent("accepted");

    handlers.beforeinstallprompt(event);

    expect(event.defaultPrevented).toBe(true);
    expect(installOffer()).toBe("prompt");
  });

  it("tells a listener when the offer appears", () => {
    listenForInstall();
    const stopped = vi.fn();
    const kept = vi.fn();
    const stop = subscribeToInstall(stopped);
    subscribeToInstall(kept);

    handlers.beforeinstallprompt(installEvent("accepted"));
    stop();
    handlers.appinstalled(new Event("appinstalled"));

    expect(stopped).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledTimes(2);
  });

  it("ends the offer, for good, once the install is accepted", async () => {
    listenForInstall();
    const event = installEvent("accepted");
    handlers.beforeinstallprompt(event);

    await install();

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(installOffer()).toBeNull();
    expect(stored[INSTALL_DISMISSED_KEY]).toBe("1");
  });

  it("leaves the button, and remembers nothing, when the dialog is cancelled", async () => {
    listenForInstall();
    const event = installEvent("dismissed");
    handlers.beforeinstallprompt(event);

    await install();

    expect(installOffer()).toBe("prompt");
    expect(stored[INSTALL_DISMISSED_KEY]).toBeUndefined();
    await install();
    expect(event.prompt).toHaveBeenCalledTimes(2);
  });

  it("drops an event the browser will not open, without remembering a dismissal", async () => {
    listenForInstall();
    const event = installEvent("accepted");
    event.prompt.mockRejectedValue(new Error("already used"));
    handlers.beforeinstallprompt(event);

    await install();

    expect(installOffer()).toBeNull();
    expect(stored[INSTALL_DISMISSED_KEY]).toBeUndefined();
    handlers.beforeinstallprompt(installEvent("accepted"));
    expect(installOffer()).toBe("prompt");
  });

  it("is not offered after the app is installed", () => {
    listenForInstall();
    handlers.beforeinstallprompt(installEvent("accepted"));

    handlers.appinstalled(new Event("appinstalled"));

    expect(installOffer()).toBeNull();
  });

  it("remembers a dismissal on the device, so the next visit does not ask", () => {
    browser(IPHONE_SAFARI);
    listenForInstall();
    expect(installOffer()).toBe("steps");

    dismissInstall();
    expect(installOffer()).toBeNull();

    // The next visit: the same storage, a fresh page.
    const kept = stored;
    browser(IPHONE_SAFARI);
    stored = kept;
    listenForInstall();
    expect(installOffer()).toBeNull();
  });

  it("gives no steps in the installed app", () => {
    browser(IPHONE_SAFARI);
    standalone = true;

    listenForInstall();

    expect(installOffer()).toBeNull();
  });

  it("still offers when storage refuses to remember", () => {
    browser(IPHONE_SAFARI);
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    listenForInstall();

    expect(installOffer()).toBe("steps");
  });
});
