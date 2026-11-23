// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { focusKeyOf } from "./keys";
import { forgetAll, recall, remember } from "./memory";

beforeEach(forgetAll);

describe("remember and recall", () => {
  it("keeps the last key for a route, and no more than 50 routes", () => {
    remember("/a", "key:one");
    remember("/a", "key:two");
    expect(recall("/a")).toBe("key:two");
    for (let i = 0; i < 60; i += 1) remember(`/r${i}`, "key:x");
    expect(recall("/a")).toBeNull();
    expect(recall("/r59")).toBe("key:x");
  });
});

describe("focusKeyOf", () => {
  it("names a control by its data-focus-key, or a link in the main area by its href", () => {
    document.body.innerHTML = `
      <nav><a id="nav" href="/x">nav</a></nav>
      <main>
        <div data-focus-key="row-1"><button id="inner">go</button></div>
        <a id="card" href="/maths">maths</a>
        <button id="plain">plain</button>
      </main>`;
    const get = (id: string) => document.getElementById(id)!;
    expect(focusKeyOf(get("inner"))).toBe("key:row-1");
    expect(focusKeyOf(get("card"))).toBe("href:/maths");
    expect(focusKeyOf(get("nav"))).toBeNull();
    expect(focusKeyOf(get("plain"))).toBeNull();
  });
});
