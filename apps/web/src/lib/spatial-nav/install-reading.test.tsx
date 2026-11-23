// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "@/test/layout";
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
  vi.restoreAllMocks();
});

const press = (key: string, on: Element = document.body) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  on.dispatchEvent(event);
  return event.defaultPrevented;
};
const wheel = () =>
  document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
const move = (dx: number, dy: number) => {
  const event = new MouseEvent("mousemove", { bubbles: true });
  size(event, "movementX", dx);
  size(event, "movementY", dy);
  document.body.dispatchEvent(event);
};
const focused = () => document.activeElement?.textContent;
const text = (name: string) => screen.getByText(name);

/** What a click, `autoFocus` or a restore leaves: focus without its ring; a keyboard or pad leaves the ring. */
function ring(el: Element, shown: boolean) {
  const matches = el.matches.bind(el);
  vi.spyOn(el, "matches").mockImplementation((selector: string) =>
    selector === ":focus-visible" ? shown : matches(selector),
  );
}

/** A lesson: a title, then a row of two buttons, then one more below. */
function lesson() {
  render(
    <main>
      <h1 tabIndex={-1}>Fractions</h1>
      <button>Start</button>
      <button>Skip</button>
      <button>Next</button>
    </main>,
  );
  place(text("Fractions"), { left: 0, top: 0, width: 100, height: 40 });
  place(text("Start"), { left: 0, top: 100, width: 100, height: 50 });
  place(text("Skip"), { left: 150, top: 100, width: 100, height: 50 });
  place(text("Next"), { left: 0, top: 200, width: 100, height: 50 });
}

describe("a pointer session with nothing or a title focused", () => {
  it("leaves all four arrows native, with a control in view", () => {
    lesson();
    wheel();
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(press(key), key).toBe(false);
    }
    expect(document.activeElement).toBe(document.body);
  });

  it("does the same with the screen's title focused", () => {
    lesson();
    text("Fractions").focus();
    document.body.dispatchEvent(new Event("mousedown", { bubbles: true }));
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(press(key, text("Fractions")), key).toBe(false);
    }
    expect(focused()).toBe("Fractions");
  });
});

describe("a pointer session with a control focused", () => {
  it("keeps Up and Down native on a clicked control, though it has scrolled out of view", () => {
    lesson();
    place(text("Start"), { left: 0, top: 3000, width: 100, height: 50 });
    text("Start").focus();
    ring(text("Start"), false);
    wheel();
    expect(press("ArrowDown", text("Start"))).toBe(false);
    expect(press("ArrowUp", text("Start"))).toBe(false);
    expect(focused()).toBe("Start");
  });

  it("sends Left and Right to the pad: they move focus, and the next Down does too", () => {
    lesson();
    text("Start").focus();
    ring(text("Start"), false);
    wheel();
    expect(press("ArrowRight", text("Start"))).toBe(true);
    expect(focused()).toBe("Skip");
    ring(text("Skip"), false);
    expect(press("ArrowDown", text("Skip"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("treats a control with its ring shown as the pad's", () => {
    lesson();
    text("Start").focus();
    ring(text("Start"), true);
    wheel();
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("goes back to the pad on Tab, from nothing focused too", () => {
    lesson();
    wheel();
    expect(press("ArrowDown")).toBe(false);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("goes to the pointer when it moves, and not when the page moved under it", () => {
    vi.useFakeTimers();
    try {
      lesson();
      move(0, 0);
      vi.advanceTimersByTime(300);
      expect(press("ArrowDown")).toBe(true);
      (document.activeElement as HTMLElement).blur();
      vi.advanceTimersByTime(300);
      move(4, 2);
      expect(press("ArrowDown")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not set to the pointer by a click made by the keyboard, or a move just after a key", () => {
    lesson();
    const click = new MouseEvent("click", { bubbles: true, detail: 0 });
    document.body.dispatchEvent(click);
    expect(press("ArrowDown")).toBe(true);
    (document.activeElement as HTMLElement).blur();
    press("ArrowUp");
    move(5, 5);
    expect(press("ArrowDown")).toBe(true);
  });
});

describe("a session of the pad", () => {
  it("reaches a control below the fold, scrolled to, where the browser would not scroll", () => {
    lesson();
    place(text("Next"), { left: 0, top: 4000, width: 100, height: 50 });
    text("Start").focus();
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("is not stuck when the focused control has scrolled away: Left and Right still move", () => {
    lesson();
    place(text("Start"), { left: 0, top: 4000, width: 100, height: 50 });
    place(text("Skip"), { left: 150, top: 4000, width: 100, height: 50 });
    text("Start").focus();
    expect(press("ArrowRight", text("Start"))).toBe(true);
    expect(focused()).toBe("Skip");
  });

  it("starts from the title: the first arrow focuses the control below", () => {
    lesson();
    text("Fractions").focus();
    expect(press("ArrowDown", text("Fractions"))).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("does not take the key when focus did not move", () => {
    lesson();
    text("Start").focus();
    vi.spyOn(text("Next"), "focus").mockImplementation(() => undefined);
    expect(press("ArrowDown", text("Start"))).toBe(false);
    expect(focused()).toBe("Start");
  });

  it("lets the key scroll when there is nothing at all that way", () => {
    lesson();
    text("Next").focus();
    expect(press("ArrowDown", text("Next"))).toBe(false);
  });

  it("swallows a repeat that comes too soon only when there is a control to move to", () => {
    vi.useFakeTimers();
    try {
      render(
        <main>
          <button>one</button>
          <button>two</button>
          <button>three</button>
        </main>,
      );
      place(text("one"), { left: 0, top: 0, width: 100, height: 50 });
      place(text("two"), { left: 0, top: 100, width: 100, height: 50 });
      place(text("three"), { left: 0, top: 200, width: 100, height: 50 });
      text("one").focus();
      expect(press("ArrowDown", text("one"))).toBe(true);
      expect(focused()).toBe("two");
      vi.advanceTimersByTime(10);
      expect(press("ArrowDown", text("two"))).toBe(true);
      expect(focused()).toBe("two");
      vi.advanceTimersByTime(100);
      expect(press("ArrowDown", text("two"))).toBe(true);
      expect(focused()).toBe("three");
      vi.advanceTimersByTime(10);
      expect(press("ArrowDown", text("three"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
