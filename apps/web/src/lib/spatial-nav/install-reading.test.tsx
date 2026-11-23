// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "@/test/layout";
import { resetActivity } from "./activity";
import { installSpatialNav } from "./install";

let remove: () => void;

const size = (el: object, name: string, value: number) =>
  Object.defineProperty(el, name, { value, configurable: true });

beforeEach(() => {
  remove = installSpatialNav(document);
  size(window, "innerWidth", 1000);
  size(window, "innerHeight", 800);
});
afterEach(() => {
  remove();
  cleanup();
  resetActivity();
  size(document.documentElement, "scrollHeight", 0);
  size(document.documentElement, "clientHeight", 0);
});

/** The page is a long lesson: 5000px of text under an 800px window. */
function longPage(canScroll = true) {
  size(document.documentElement, "scrollHeight", canScroll ? 5000 : 800);
  size(document.documentElement, "clientHeight", 800);
}

const press = (key: string, on: Element = document.body, repeat = false) => {
  const event = new KeyboardEvent("keydown", {
    key,
    repeat,
    bubbles: true,
    cancelable: true,
  });
  on.dispatchEvent(event);
  return event.defaultPrevented;
};
const pointerMoves = () =>
  document.body.dispatchEvent(new Event("pointermove", { bubbles: true }));
const focused = () => document.activeElement?.textContent;

function lesson() {
  render(
    <main>
      <h1 tabIndex={-1}>Fractions</h1>
      <p>prose</p>
      <button>Start</button>
      <button>Next</button>
    </main>,
  );
  place(screen.getByRole("heading"), {
    left: 0,
    top: 0,
    width: 600,
    height: 40,
  });
  place(screen.getByText("Start"), {
    left: 0,
    top: 100,
    width: 100,
    height: 50,
  });
  place(screen.getByText("Next"), {
    left: 0,
    top: 200,
    width: 100,
    height: 50,
  });
}

describe("reading a long page with a mouse", () => {
  it("scrolls with the arrows when nothing has focus, though a control is in view", () => {
    longPage();
    lesson();
    pointerMoves();
    expect(press("ArrowDown")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("scrolls with the arrows when only the screen's title has focus", () => {
    longPage();
    lesson();
    screen.getByRole("heading").focus();
    pointerMoves();
    expect(press("ArrowDown", screen.getByRole("heading"))).toBe(false);
    expect(focused()).toBe("Fractions");
  });

  it("scrolls the scroll area that was pointed at, when nothing has focus", () => {
    render(
      <main data-testid="area" style={{ overflowY: "auto" }}>
        <p data-testid="text">prose</p>
        <button>Start</button>
      </main>,
    );
    size(screen.getByTestId("area"), "scrollHeight", 3000);
    size(screen.getByTestId("area"), "clientHeight", 500);
    place(screen.getByText("Start"), {
      left: 0,
      top: 100,
      width: 100,
      height: 50,
    });
    screen
      .getByTestId("text")
      .dispatchEvent(new Event("wheel", { bubbles: true }));
    expect(press("ArrowDown")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("navigates once the page cannot scroll that way", () => {
    longPage(false);
    lesson();
    pointerMoves();
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("Start");
  });
});

describe("a control has focus", () => {
  it("moves to the visible control below", () => {
    longPage();
    lesson();
    screen.getByText("Start").focus();
    expect(press("ArrowDown", screen.getByText("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("scrolls when no visible control is below, rather than jumping to one far away", () => {
    longPage();
    lesson();
    place(screen.getByText("Next"), {
      left: 0,
      top: 4000,
      width: 100,
      height: 50,
    });
    screen.getByText("Start").focus();
    expect(press("ArrowDown", screen.getByText("Start"))).toBe(false);
    expect(focused()).toBe("Start");
  });

  it("scrolls on a held key too when there is nothing to move to", () => {
    longPage();
    lesson();
    place(screen.getByText("Next"), {
      left: 0,
      top: 4000,
      width: 100,
      height: 50,
    });
    screen.getByText("Start").focus();
    expect(press("ArrowDown", screen.getByText("Start"), true)).toBe(false);
  });

  it("does not take the key when focus did not move", () => {
    longPage();
    lesson();
    screen.getByText("Start").focus();
    const next = screen.getByText("Next");
    vi.spyOn(next, "focus").mockImplementation(() => undefined);
    expect(press("ArrowDown", screen.getByText("Start"))).toBe(false);
    expect(focused()).toBe("Start");
  });
});

describe("a session of the pad alone", () => {
  it("starts from the title: the first arrow focuses the control below", () => {
    longPage();
    lesson();
    screen.getByRole("heading").focus();
    expect(press("ArrowDown", screen.getByRole("heading"))).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("starts from nothing at the first control in view", () => {
    longPage();
    lesson();
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("goes back to scrolling when a wheel or a pointer shows a mouse is in use", () => {
    longPage();
    lesson();
    const title = screen.getByRole("heading");
    title.focus();
    document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
    expect(press("ArrowDown", title)).toBe(false);
    expect(document.activeElement).toBe(title);
  });

  it("counts a touch the same way", () => {
    longPage();
    lesson();
    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(press("ArrowDown")).toBe(false);
  });
});
