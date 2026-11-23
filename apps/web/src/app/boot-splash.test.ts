// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { dismissBootSplashWhenDrawn } from "./boot-splash";

const splash = () => document.getElementById("boot");
const root = () => document.getElementById("root")!;
/** Lets the observer's microtask run, as it does before the browser's next paint. */
const drawn = () => Promise.resolve();

beforeEach(() => {
  document.body.innerHTML = '<div id="boot"></div><div id="root"></div>';
});

describe("dismissBootSplashWhenDrawn", () => {
  it("leaves the first paint up while the app has drawn nothing", async () => {
    dismissBootSplashWhenDrawn();
    await drawn();
    expect(splash()).not.toBeNull();
  });

  it("takes it down in the same turn the app first draws anything, a loading screen included", async () => {
    dismissBootSplashWhenDrawn();
    root().appendChild(document.createElement("main"));
    await drawn();
    expect(splash()).toBeNull();
  });

  it("takes it down for an error screen too", async () => {
    dismissBootSplashWhenDrawn();
    root().appendChild(document.createElement("h1"));
    await drawn();
    expect(splash()).toBeNull();
  });

  it("keeps it for a render that leaves the root empty, and takes it down once the page arrives", async () => {
    dismissBootSplashWhenDrawn();
    root().appendChild(document.createTextNode("not an element"));
    await drawn();
    expect(splash()).not.toBeNull();
    root().appendChild(document.createElement("main"));
    await drawn();
    expect(splash()).toBeNull();
  });

  it("does nothing on a page without one", () => {
    document.body.innerHTML = '<div id="root"></div>';
    expect(() => dismissBootSplashWhenDrawn()).not.toThrow();
  });
});
