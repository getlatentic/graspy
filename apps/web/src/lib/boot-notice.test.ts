// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ?raw keeps this inside the browser tsconfig, with no node types.
import html from "../../index.html?raw";

// The boot script is the first inline script, the one the CSP hashes.
const SCRIPT = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)![1]!;
const ASSET = "https://graspy.test/assets/index-abc.js";

let listeners: Array<[string, EventListener]> = [];

function open({ modern = true, rendered = false } = {}) {
  document.body.innerHTML = `<div id="root">${rendered ? "<p>app</p>" : ""}</div>`;
  vi.stubGlobal("CSSLayerBlockRule", modern ? class {} : undefined);
  vi.stubGlobal("CSS", { supports: () => modern });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(((
    type: string,
    listener: EventListener,
  ) => {
    listeners.push([type, listener]);
    add(type, listener);
  }) as typeof window.addEventListener);
  new Function(SCRIPT)();
}

function fail(error: Error, filename: string) {
  window.dispatchEvent(new ErrorEvent("error", { error, filename }));
}

const notice = () => document.getElementById("too-old");
const app = () => document.getElementById("root")!;

beforeEach(() => {
  listeners = [];
  document.documentElement.removeAttribute("lang");
});

afterEach(() => {
  for (const [type, listener] of listeners)
    window.removeEventListener(type, listener);
  delete window.__graspyBooted;
  vi.unstubAllGlobals();
});

describe("a browser that cannot run the app", () => {
  it("gets the notice, with the page inert, hidden and out of focus", () => {
    open({ modern: false });
    expect(notice()?.getAttribute("role")).toBe("alert");
    expect(notice()?.textContent).toContain("This browser is too old for graspy.");
    expect(app().hasAttribute("inert")).toBe(true);
    expect(app().getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(notice());
  });

  it("keeps it after the app reports in", () => {
    open({ modern: false });
    window.__graspyBooted!();
    expect(notice()).not.toBeNull();
    expect(app().hasAttribute("inert")).toBe(true);
  });
});

describe("a browser that passes the checks", () => {
  it("shows nothing", () => {
    open();
    expect(notice()).toBeNull();
    expect(app().hasAttribute("inert")).toBe(false);
  });

  it("shows the notice when the app's own script cannot be parsed", () => {
    open();
    fail(new SyntaxError("Unexpected token"), ASSET);
    expect(notice()).not.toBeNull();
    expect(app().getAttribute("aria-hidden")).toBe("true");
  });

  it("takes the notice down when the app turns out to run", () => {
    open();
    fail(new SyntaxError("Unexpected token"), ASSET);
    window.__graspyBooted!();
    expect(notice()).toBeNull();
    expect(app().hasAttribute("inert")).toBe(false);
    expect(app().hasAttribute("aria-hidden")).toBe(false);
  });

  it("ignores a SyntaxError after the app has started", () => {
    open();
    window.__graspyBooted!();
    fail(new SyntaxError("late"), ASSET);
    expect(notice()).toBeNull();
  });

  it("ignores a SyntaxError from a script that is not the app's", () => {
    open();
    fail(new SyntaxError("extension"), "chrome-extension://abc/inject.js");
    fail(new SyntaxError("timer"), "");
    expect(notice()).toBeNull();
  });

  it("ignores a DOMException SyntaxError from a handler", () => {
    open();
    fail(new DOMException("bad selector", "SyntaxError"), ASSET);
    expect(notice()).toBeNull();
  });

  it("ignores other kinds of error", () => {
    open();
    fail(new TypeError("x"), ASSET);
    expect(notice()).toBeNull();
  });

  it("ignores a SyntaxError once the page has rendered", () => {
    open({ rendered: true });
    fail(new SyntaxError("x"), ASSET);
    expect(notice()).toBeNull();
  });
});
