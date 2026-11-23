// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ?raw keeps this inside the browser tsconfig, with no node types.
import html from "../../index.html?raw";
import pageChunks from "../app/page-chunks.ts?raw";

const SCRIPT = html.match(
  /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/,
)![1]!;
const STALE_KEY = "graspy.reloaded-for-stale-chunk";

let listeners: Array<[string, EventListenerOrEventListenerObject, boolean]> =
  [];

function open(
  links = '<link rel="preconnect" href="https://api.test/api" crossorigin />',
) {
  document.head.innerHTML = links;
  document.body.innerHTML = '<div id="boot"></div><div id="root"></div>';
  vi.stubGlobal("CSSLayerBlockRule", class {});
  vi.stubGlobal("CSS", { supports: () => true });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    capture?: boolean | AddEventListenerOptions,
  ) => {
    listeners.push([type, listener, capture === true]);
    add(type, listener, capture);
  }) as typeof window.addEventListener);
  new Function(SCRIPT)();
}

/** A file of the build failing to load: the error is on the element and does not bubble. */
function failToLoad(tag: "script" | "link", address: string) {
  const file = document.createElement(tag);
  if (tag === "script") (file as HTMLScriptElement).src = address;
  else (file as HTMLLinkElement).href = address;
  document.head.appendChild(file);
  file.dispatchEvent(new Event("error"));
}

const reload = vi.fn();

beforeEach(() => {
  listeners = [];
  reload.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});

afterEach(() => {
  for (const [type, listener, capture] of listeners)
    window.removeEventListener(type, listener, capture);
  delete window.__graspyBooted;
  delete (window as { __graspyWarmed?: boolean }).__graspyWarmed;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a build file that fails to load after a deploy", () => {
  it("reloads the page once, onto the new build", () => {
    open();
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).toHaveBeenCalledOnce();
    expect(Number(sessionStorage.getItem(STALE_KEY))).toBeGreaterThan(0);
  });

  it("does so for a preloaded or styled file too", () => {
    open();
    failToLoad("link", "https://graspy.test/assets/cn-abc.js");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves a file that fails once the app has started to the chunk reload, so a prefetch that blips does not reload a page in use", () => {
    open();
    window.__graspyBooted!();
    failToLoad("link", "https://graspy.test/assets/lesson-page-abc.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload again within ten seconds: that would be a loop", () => {
    open();
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads again for a later deploy", () => {
    open();
    sessionStorage.setItem(STALE_KEY, String(Date.now() - 11_000));
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps its guard under the key the chunk reload uses, so the two read one record", () => {
    expect(pageChunks).toContain(`"${STALE_KEY}"`);
    expect(html).toContain(`'${STALE_KEY}'`);
  });

  it("shares its guard with the chunks loaded later, so the two cannot loop together", () => {
    open();
    sessionStorage.setItem(STALE_KEY, String(Date.now() - 1_000));
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload offline: the browser's offline page would show", () => {
    open();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload where storage cannot remember it, which would loop", () => {
    open();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    failToLoad("script", "https://graspy.test/assets/index-abc.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a file that is not the build's", () => {
    open();
    failToLoad("script", "https://static.cloudflareinsights.com/beacon.min.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores an image that fails", () => {
    open();
    const image = document.createElement("img");
    image.src = "https://graspy.test/assets/art.png";
    document.body.appendChild(image);
    image.dispatchEvent(new Event("error"));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("the server's first request", () => {
  it("is made while the page loads, to the address the preconnect link carries", () => {
    open();
    expect(fetch).toHaveBeenCalledWith("https://api.test/api/health", {
      cache: "no-store",
    });
    expect((window as { __graspyWarmed?: boolean }).__graspyWarmed).toBe(true);
  });

  it("is not made without that link", () => {
    open("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not stop the page when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(() => open()).not.toThrow();
    await Promise.resolve();
  });
});

describe("the too-old notice", () => {
  it("takes the first paint down, so the two are never stacked", () => {
    vi.stubGlobal("CSSLayerBlockRule", undefined);
    document.head.innerHTML = "";
    document.body.innerHTML = '<div id="boot"></div><div id="root"></div>';
    new Function(SCRIPT)();
    expect(document.getElementById("boot")).toBeNull();
    expect(document.getElementById("too-old")).not.toBeNull();
  });
});
