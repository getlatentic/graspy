// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "@/test/layout";
import { installSpatialNav } from "./install";

let remove: (() => void) | null = null;

const size = (el: object, name: string, value: number) =>
  Object.defineProperty(el, name, { value, configurable: true });

/** The page is installed fresh each time: a desktop visit starts reading, a TV on the pad. */
function install(tv: boolean) {
  if (tv) document.documentElement.dataset.device = "tv";
  remove = installSpatialNav(document);
}

beforeEach(() => {
  size(window, "innerWidth", 1000);
  size(window, "innerHeight", 800);
});
afterEach(() => {
  remove?.();
  remove = null;
  delete document.documentElement.dataset.device;
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
/** Time passes: the same direction twice within 70 ms is a held key. */
const later = () => vi.advanceTimersByTime(300);

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

/** An article: long prose with two links, one about two screens down and one far below. */
function article() {
  render(
    <main>
      <h1 tabIndex={-1}>Essay</h1>
      <a href="/near">near</a>
      <a href="/far">far</a>
    </main>,
  );
  place(text("Essay"), { left: 0, top: 0, width: 100, height: 40 });
  place(text("near"), { left: 0, top: 1500, width: 100, height: 20 });
  place(text("far"), { left: 0, top: 9000, width: 100, height: 20 });
}

describe("a keyboard reader on a desktop (the visit starts reading)", () => {
  it("scrolls with ArrowDown and ArrowUp on a long article, never hopping to a link", () => {
    install(false);
    article();
    for (const key of ["ArrowDown", "ArrowUp", "ArrowDown"]) {
      expect(press(key), key).toBe(false);
    }
    text("Essay").focus();
    expect(press("ArrowDown", text("Essay"))).toBe(false);
    expect(focused()).toBe("Essay");
  });

  it("is not changed by Tab alone: the arrows still scroll", () => {
    install(false);
    lesson();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(press("ArrowDown")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("navigates from a control that Tab reached, which shows its ring, and stays on the pad", () => {
    install(false);
    lesson();
    text("Start").focus();
    ring(text("Start"), true);
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
    ring(text("Next"), false);
    expect(press("ArrowUp", text("Next"))).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("takes Left and Right, which scroll nothing, as navigation: the first control, then the pad", () => {
    install(false);
    lesson();
    expect(press("ArrowRight")).toBe(true);
    expect(focused()).toBe("Start");
    ring(text("Start"), false);
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("leaves Left and Right native when the page scrolls sideways", () => {
    install(false);
    lesson();
    size(document.documentElement, "scrollWidth", 5000);
    size(document.documentElement, "clientWidth", 1000);
    expect(press("ArrowRight")).toBe(false);
    size(document.documentElement, "scrollWidth", 0);
    size(document.documentElement, "clientWidth", 0);
  });

  it("does not change the session when Left and Right find nothing to go to", () => {
    install(false);
    render(<main>no controls</main>);
    expect(press("ArrowRight")).toBe(false);
    expect(press("ArrowDown")).toBe(false);
  });

  it("does not pull focus back to a control that has scrolled out of view, even one with its ring", () => {
    install(false);
    lesson();
    place(text("Start"), { left: 0, top: 3000, width: 100, height: 50 });
    text("Start").focus();
    ring(text("Start"), true);
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(press(key, text("Start")), key).toBe(false);
    }
    expect(focused()).toBe("Start");
  });

  it("keeps Up and Down native on a clicked control, and sends Left and Right to the pad", () => {
    install(false);
    lesson();
    text("Start").focus();
    ring(text("Start"), false);
    expect(press("ArrowDown", text("Start"))).toBe(false);
    expect(press("ArrowRight", text("Start"))).toBe(true);
    expect(focused()).toBe("Skip");
  });

  it("goes back to reading when the pointer moves, and not when the page moved under it", () => {
    vi.useFakeTimers();
    try {
      install(false);
      lesson();
      press("ArrowRight");
      later();
      move(0, 0);
      expect(press("ArrowDown", text("Start"))).toBe(true);
      later();
      move(4, 2);
      (document.activeElement as HTMLElement).blur();
      expect(press("ArrowDown")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a TV (the visit starts on the pad)", () => {
  it("starts from the title: the first arrow focuses the control below", () => {
    install(true);
    lesson();
    text("Fractions").focus();
    expect(press("ArrowDown", text("Fractions"))).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("starts from nothing at the first control in view", () => {
    install(true);
    lesson();
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("is back on the pad at the first key after the pointer was wiggled", () => {
    vi.useFakeTimers();
    try {
      install(true);
      lesson();
      wheel();
      move(5, 5);
      later();
      text("Start").focus();
      ring(text("Start"), false);
      expect(press("ArrowRight", text("Start"))).toBe(true);
      expect(focused()).toBe("Skip");
      later();
      move(3, 3);
      later();
      expect(press("ArrowDown", text("Skip"))).toBe(true);
      expect(focused()).toBe("Next");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is on the pad again after OK, whatever the pointer did", () => {
    install(true);
    lesson();
    wheel();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("Start");
  });

  it("reaches a control below the fold, scrolled to, where the browser would not scroll", () => {
    install(true);
    lesson();
    place(text("Next"), { left: 0, top: 1500, width: 100, height: 50 });
    text("Start").focus();
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });

  it("does not go further than three screens, so a reader of a long article is not teleported", () => {
    install(true);
    article();
    text("Essay").focus();
    expect(press("ArrowDown", text("Essay"))).toBe(true);
    expect(focused()).toBe("near");
    expect(press("ArrowDown", text("near"))).toBe(false);
    expect(focused()).toBe("near");
  });

  it("is not stuck when the focused control has scrolled away: Left and Right still move", () => {
    install(true);
    lesson();
    place(text("Start"), { left: 0, top: 4000, width: 100, height: 50 });
    place(text("Skip"), { left: 150, top: 4000, width: 100, height: 50 });
    text("Start").focus();
    expect(press("ArrowRight", text("Start"))).toBe(true);
    expect(focused()).toBe("Skip");
  });

  it("does not take the key when focus did not move, nor change the session", () => {
    install(true);
    lesson();
    text("Start").focus();
    vi.spyOn(text("Next"), "focus").mockImplementation(() => undefined);
    expect(press("ArrowDown", text("Start"))).toBe(false);
    expect(focused()).toBe("Start");
  });

  it("lets the key scroll when there is nothing at all that way, and does not measure again at once", () => {
    install(true);
    lesson();
    text("Next").focus();
    expect(press("ArrowDown", text("Next"))).toBe(false);
    const measured = vi.fn();
    const rect = text("Start").getBoundingClientRect;
    text("Start").getBoundingClientRect = () => {
      measured();
      return rect.call(text("Start"));
    };
    expect(press("ArrowDown", text("Next"))).toBe(false);
    expect(measured).not.toHaveBeenCalled();
  });

  it("swallows a repeat that comes too soon only when there is a control to move to", () => {
    vi.useFakeTimers();
    try {
      install(true);
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
