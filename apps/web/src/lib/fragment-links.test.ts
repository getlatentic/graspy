// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFragmentLinks } from "./fragment-links";

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

function page(href: string, target = "main") {
  document.body.innerHTML = `<a href="${href}">go</a><section id="${target}">there</section>`;
  Element.prototype.scrollIntoView = vi.fn();
}

const click = (init: MouseEventInit = {}) => {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  document.querySelector("a")!.dispatchEvent(event);
  return event;
};

describe("a link to a place on the same page", () => {
  it("moves there and takes focus without a history entry, so Back is not spent undoing the jump", () => {
    page("#main");
    const stop = installFragmentLinks();
    const before = window.history.length;
    const event = click();
    expect(event.defaultPrevented).toBe(true);
    expect(window.history.length).toBe(before);
    expect(window.location.hash).toBe("");
    const target = document.getElementById("main");
    expect(document.activeElement).toBe(target);
    expect(target?.getAttribute("tabindex")).toBe("-1");
    stop();
  });

  it("leaves a link to a missing place, a modified click and other links to the browser", () => {
    const stop = installFragmentLinks();
    page("#nowhere");
    expect(click().defaultPrevented).toBe(false);
    page("#main");
    expect(click({ ctrlKey: true }).defaultPrevented).toBe(false);
    page("/elsewhere");
    expect(click().defaultPrevented).toBe(false);
    stop();
  });
});
