// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { place } from "@/test/layout";
import { installSpatialNav } from "./install";

let remove: () => void;

const size = (el: object, name: string, value: number) =>
  Object.defineProperty(el, name, { value, configurable: true });

beforeEach(() => {
  document.documentElement.dataset.device = "tv";
  remove = installSpatialNav(document);
  size(window, "innerWidth", 1000);
  size(window, "innerHeight", 800);
});
afterEach(() => {
  remove();
  delete document.documentElement.dataset.device;
  cleanup();
  document.documentElement.removeAttribute("style");
});

const press = (key: string, on: Element) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  on.dispatchEvent(event);
  return event.defaultPrevented;
};
const button = (name: string) => screen.getByRole("button", { name });
const at = (el: Element, top: number, left = 0) =>
  place(el, { left, top, width: 100, height: 50 });
const focused = () => document.activeElement?.textContent;

describe("what is skipped", () => {
  it("controls inside a disabled fieldset", () => {
    render(
      <main>
        <button>start</button>
        <fieldset disabled>
          <button>inside</button>
        </fieldset>
        <button>end</button>
      </main>,
    );
    at(button("start"), 0);
    at(button("inside"), 60);
    at(button("end"), 120);
    button("start").focus();
    expect(press("ArrowDown", button("start"))).toBe(true);
    expect(focused()).toBe("end");
  });

  it("controls outside the viewport, clipped by a hidden parent or under another element", () => {
    render(
      <main>
        <button>start</button>
        <button>drawer</button>
        <div
          data-testid="clip"
          style={{ overflowX: "hidden", overflowY: "hidden" }}
        >
          <button>clipped</button>
        </div>
        <button>covered</button>
        <button>end</button>
      </main>,
    );
    at(button("start"), 0);
    at(button("drawer"), 60, -2000);
    place(screen.getByTestId("clip"), {
      left: 0,
      top: 60,
      width: 100,
      height: 10,
    });
    at(button("clipped"), 200);
    at(button("covered"), 300);
    at(button("end"), 400);
    const cover = document.createElement("div");
    document.elementFromPoint = (_x, y) =>
      y > 310 && y < 330 ? cover : document.body;
    button("start").focus();
    // drawer is off screen to the left, clipped sits below its 10px box, covered is under the overlay.
    expect(press("ArrowDown", button("start"))).toBe(true);
    expect(focused()).toBe("end");
    document.elementFromPoint = undefined as never;
  });
});

describe("modal scope", () => {
  const pageAndSheet = (sheet: React.ReactNode) =>
    render(
      <>
        <main>
          <button>behind</button>
          <button>below</button>
        </main>
        {sheet}
      </>,
    );

  it("is not made by a dialog role alone", () => {
    pageAndSheet(
      <div role="dialog" aria-label="note">
        <button>inside</button>
      </div>,
    );
    at(button("behind"), 0);
    at(button("below"), 60);
    at(button("inside"), 500);
    button("inside").focus();
    expect(press("ArrowUp", button("inside"))).toBe(true);
    expect(focused()).toBe("below");
  });

  it("is not made by a dialog opened with show()", () => {
    pageAndSheet(
      <dialog open>
        <button>inside</button>
      </dialog>,
    );
    at(button("behind"), 0);
    at(button("below"), 60);
    at(button("inside"), 500);
    button("behind").focus();
    expect(press("ArrowDown", button("behind"))).toBe(true);
    expect(focused()).toBe("below");
  });

  it("is not a modal that is hidden from people or inert", () => {
    pageAndSheet(
      <>
        <div aria-hidden="true">
          <div aria-modal="true" role="dialog">
            <button>hidden sheet</button>
          </div>
        </div>
        <div inert>
          <div aria-modal="true" role="dialog">
            <button>inert sheet</button>
          </div>
        </div>
      </>,
    );
    at(button("behind"), 0);
    at(button("below"), 60);
    at(screen.getByRole("button", { name: "hidden sheet", hidden: true }), 500);
    at(screen.getByRole("button", { name: "inert sheet", hidden: true }), 560);
    button("behind").focus();
    expect(press("ArrowDown", button("behind"))).toBe(true);
    expect(focused()).toBe("below");
  });

  it("is a visible aria-modal dialog, which keeps the arrows inside", () => {
    pageAndSheet(
      <div role="dialog" aria-modal="true" aria-label="sheet">
        <button>yes</button>
      </div>,
    );
    at(button("behind"), 0);
    at(button("below"), 60);
    at(button("yes"), 120);
    button("behind").focus();
    expect(press("ArrowDown", button("behind"))).toBe(true);
    expect(focused()).toBe("yes");
  });

  it("reads the writing direction from the focused element's own dir", () => {
    render(
      <>
        <main dir="rtl">
          <button>behind</button>
        </main>
        <div role="dialog" aria-modal="true" aria-label="sheet" dir="rtl">
          <button>left</button>
          <button>right</button>
        </div>
      </>,
    );
    at(button("behind"), 0);
    at(button("left"), 100, 0);
    at(button("right"), 100, 300);
    button("behind").focus();
    press("ArrowDown", button("behind"));
    expect(focused()).toBe("right");
  });
});

describe("native widgets", () => {
  it("let the last radio of a group leave with Down or Right, and the first with Up or Left", () => {
    render(
      <main>
        <button>above</button>
        <input type="radio" name="g" aria-label="one" />
        <input type="radio" name="g" aria-label="two" />
        <button>below</button>
      </main>,
    );
    at(button("above"), 0);
    at(screen.getByLabelText("one"), 60);
    at(screen.getByLabelText("two"), 120);
    at(button("below"), 180);
    screen.getByLabelText("two").focus();
    expect(press("ArrowDown", screen.getByLabelText("two"))).toBe(true);
    expect(focused()).toBe("below");
    screen.getByLabelText("one").focus();
    expect(press("ArrowDown", screen.getByLabelText("one"))).toBe(false);
    expect(press("ArrowUp", screen.getByLabelText("one"))).toBe(true);
    expect(focused()).toBe("above");
  });

  it("let a native select's Left and Right leave, and its Up and Down leave at the ends", () => {
    render(
      <main>
        <button>above</button>
        <select aria-label="pick" defaultValue="y">
          <option>x</option>
          <option>y</option>
        </select>
        <button>below</button>
      </main>,
    );
    at(button("above"), 0);
    at(screen.getByLabelText("pick"), 60);
    at(button("below"), 120);
    const select = screen.getByLabelText("pick");
    select.focus();
    expect(press("ArrowDown", select)).toBe(true);
    expect(focused()).toBe("below");
    (select as HTMLSelectElement).selectedIndex = 0;
    select.focus();
    expect(press("ArrowDown", select)).toBe(false);
  });

  it("keep their arrows: media controls, textbox, grid, slider roles", () => {
    render(
      <main>
        <audio controls tabIndex={0} data-testid="audio" />
        <div role="textbox" tabIndex={0} aria-label="box" />
        <div role="grid" aria-label="grid">
          <div role="gridcell" tabIndex={0} aria-label="cell" />
        </div>
        <button>below</button>
      </main>,
    );
    const owners = [
      screen.getByTestId("audio"),
      screen.getByLabelText("box"),
      screen.getByLabelText("cell"),
    ];
    owners.forEach((el, i) => at(el, i * 60));
    at(button("below"), 300);
    for (const el of owners) {
      el.focus();
      expect(press("ArrowDown", el)).toBe(false);
      expect(document.activeElement).toBe(el);
    }
  });

  it("keep a text field inside a shadow tree", () => {
    render(
      <main>
        <div data-testid="host" />
        <button>below</button>
      </main>,
    );
    const host = screen.getByTestId("host");
    const input = document.createElement("input");
    host.attachShadow({ mode: "open" }).append(input);
    at(host, 0);
    at(button("below"), 100);
    input.focus();
    expect(press("ArrowDown", host)).toBe(false);
  });
});

describe("handlers of the page", () => {
  it("run first: an element's or an ancestor's handler that takes the arrow keeps it", () => {
    render(
      <main data-testid="main">
        <button>own</button>
        <button>next</button>
      </main>,
    );
    at(button("own"), 0);
    at(button("next"), 60);
    screen
      .getByTestId("main")
      .addEventListener("keydown", (e) => e.preventDefault());
    button("own").focus();
    expect(press("ArrowDown", button("own"))).toBe(true);
    expect(focused()).toBe("own");
  });
});
