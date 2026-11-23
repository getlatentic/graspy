// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { findByFocusKey, focusKeyOf } from "./keys";
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
  const get = (id: string) => document.getElementById(id)!;

  it("names a control by its data-focus-key, or a link by its href, within its landmark", () => {
    document.body.innerHTML = `
      <nav><a id="nav" href="/maths">nav</a></nav>
      <main>
        <div data-focus-key="row-1"><button id="inner">go</button></div>
        <a id="card" href="/maths">maths</a>
        <button id="plain">plain</button>
      </main>`;
    expect(focusKeyOf(get("inner"))).toContain("row-1");
    expect(focusKeyOf(get("card"))).not.toBe(focusKeyOf(get("nav")));
    expect(focusKeyOf(get("plain"))).toBeNull();
  });

  it("tells two links to one place in one landmark apart, and finds each", () => {
    document.body.innerHTML = `
      <main><a id="a" href="/x">one</a><a id="b" href="/x">two</a></main>`;
    const [first, second] = [focusKeyOf(get("a")), focusKeyOf(get("b"))];
    expect(first).not.toBe(second);
    expect(findByFocusKey(document, second!)).toBe(get("b"));
    expect(findByFocusKey(document, first!)).toBe(get("a"));
  });

  it("looks only in the landmark the key was recorded in", () => {
    document.body.innerHTML = `
      <nav><a id="nav" href="/x">nav</a></nav>
      <main><a id="page" href="/y">page</a></main>`;
    const key = focusKeyOf(get("nav"))!;
    document.querySelector("nav")!.remove();
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<aside><a id="other" href="/x">other</a></aside>',
    );
    expect(findByFocusKey(document, key)).toBeNull();
  });

  it("gives a control in a dialog no key (the dialog restores its opener)", () => {
    document.body.innerHTML = `<main><div role="dialog"><a id="in" href="/x">in</a></div></main>`;
    expect(focusKeyOf(get("in"))).toBeNull();
  });
});
