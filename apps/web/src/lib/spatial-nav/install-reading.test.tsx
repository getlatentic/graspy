// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "@/test/layout";
import { installSpatialNav } from "./install";

let remove: (() => void) | null = null;

const size = (el: object, name: string, value: number) =>
  Object.defineProperty(el, name, {
    value,
    configurable: true,
    writable: true,
  });

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
  size(document.documentElement, "scrollTop", 0);
  size(document.documentElement, "scrollHeight", 0);
  size(document.documentElement, "clientHeight", 0);
  size(document.documentElement, "scrollWidth", 0);
  size(document.documentElement, "clientWidth", 0);
  document.elementFromPoint = undefined as never;
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
const later = (fake = true) => (fake ? vi.advanceTimersByTime(300) : undefined);

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

/** The page is long: 5000px under an 800px window, so Up and Down have something to scroll. */
function longPage(long = true) {
  size(document.documentElement, "scrollHeight", long ? 5000 : 800);
  size(document.documentElement, "clientHeight", 800);
}

/** An article: long prose with two links, one about two screens down and one far below. */
function article() {
  longPage();
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
    longPage();
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

  it("does not pull focus back to a control that has scrolled out of view: Up and Down scroll, Left and Right go to a control in view", () => {
    install(false);
    longPage();
    lesson();
    place(text("Start"), { left: 0, top: 3000, width: 100, height: 50 });
    text("Start").focus();
    ring(text("Start"), true);
    expect(press("ArrowDown", text("Start"))).toBe(false);
    expect(press("ArrowUp", text("Start"))).toBe(false);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(press("ArrowRight", text("Start"))).toBe(true);
    expect(focused()).toBe("Skip");
  });

  it("keeps Up and Down native on a clicked control of a long page, and sends Left and Right to the pad", () => {
    install(false);
    longPage();
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
      longPage();
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

/** A single column: a full-width title, then stacked controls, as onboarding and sign-in are. */
function column(controls: string[]) {
  render(
    <main>
      <h1 tabIndex={-1}>Title</h1>
      {controls.map((c) => (
        <button key={c}>{c}</button>
      ))}
    </main>,
  );
  place(text("Title"), { left: 0, top: 0, width: 600, height: 40 });
  controls.forEach((c, i) =>
    place(text(c), { left: 100, top: 100 + i * 80, width: 300, height: 50 }),
  );
}

describe("a short single-column page, on a desktop with a pointer", () => {
  const layouts: Record<string, string[]> = {
    "onboarding-like": ["Country", "Language", "Class", "Next"],
    "sign-in-like": ["Continue with Google", "Try without an account"],
  };

  for (const [name, controls] of Object.entries(layouts)) {
    it(`${name}: from the title Down, Right and Left each land on a control`, () => {
      for (const [key, expected] of [
        ["ArrowDown", controls[0]],
        ["ArrowRight", controls[0]],
        ["ArrowLeft", controls[controls.length - 1]],
      ] as const) {
        install(false);
        column(controls);
        text("Title").focus();
        expect(press(key, text("Title")), key).toBe(true);
        expect(focused(), key).toBe(expected);
        remove?.();
        remove = null;
        cleanup();
      }
    });
  }

  it("navigates Up and Down from nothing, a title and a clicked control when nothing can scroll", async () => {
    install(false);
    column(["One", "Two", "Three"]);
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("One");
    text("Two").focus();
    ring(text("Two"), false);
    await new Promise((r) => setTimeout(r, 90));
    expect(press("ArrowDown", text("Two"))).toBe(true);
    expect(focused()).toBe("Three");
  });

  it("navigates from a dialog's programmatically focused content, when the body is locked", () => {
    install(false);
    longPage();
    document.body.style.overflowY = "hidden";
    render(
      <div role="dialog" aria-modal="true" aria-label="sheet" tabIndex={-1}>
        <button>Yes</button>
        <button>No</button>
      </div>,
    );
    place(text("Yes"), { left: 0, top: 100, width: 100, height: 50 });
    place(text("No"), { left: 0, top: 200, width: 100, height: 50 });
    screen.getByRole("dialog").focus();
    expect(press("ArrowDown", screen.getByRole("dialog"))).toBe(true);
    expect(focused()).toBe("Yes");
    document.body.style.overflowY = "";
  });
});

describe("reading a table or equation that scrolls sideways", () => {
  it("leaves Left and Right native when the scroll area under the pointer scrolls that way", () => {
    install(false);
    render(
      <main>
        <div data-testid="table" style={{ overflowX: "auto" }}>
          <span data-testid="cell">cell</span>
        </div>
        <button>Next</button>
      </main>,
    );
    size(screen.getByTestId("table"), "scrollWidth", 3000);
    size(screen.getByTestId("table"), "clientWidth", 600);
    place(text("Next"), { left: 0, top: 300, width: 100, height: 50 });
    document.elementFromPoint = () => screen.getByTestId("cell");
    document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
    expect(press("ArrowRight")).toBe(false);
    expect(document.activeElement).toBe(document.body);
    document.elementFromPoint = undefined as never;
  });
});

describe("the first hop in reading mode", () => {
  it("goes to a control in view, and leaves a control past the window to the browser", () => {
    install(false);
    longPage();
    render(
      <main>
        <button>here</button>
        <button>near</button>
        <button>below</button>
      </main>,
    );
    place(text("here"), { left: 0, top: 0, width: 100, height: 50 });
    place(text("near"), { left: 0, top: 300, width: 100, height: 50 });
    place(text("below"), { left: 0, top: 1500, width: 100, height: 50 });
    text("here").focus();
    ring(text("here"), true);
    expect(press("ArrowDown", text("here"))).toBe(true);
    expect(focused()).toBe("near");
  });

  it("leaves Down to the browser when the next control is past the window", () => {
    install(false);
    longPage();
    render(
      <main>
        <button>here</button>
        <button>below</button>
      </main>,
    );
    place(text("here"), { left: 0, top: 0, width: 100, height: 50 });
    place(text("below"), { left: 0, top: 1500, width: 100, height: 50 });
    text("here").focus();
    ring(text("here"), true);
    expect(press("ArrowDown", text("here"))).toBe(false);
    expect(focused()).toBe("here");
  });
});

describe("holding an arrow to the end of a long page", () => {
  const title = () => text("Fractions");

  function longLesson(scrollTop: number, titleTop: number) {
    longPage();
    lesson();
    size(document.documentElement, "scrollTop", scrollTop);
    place(title(), { left: 0, top: titleTop, width: 100, height: 40 });
  }

  it("never moves focus, scrolls back or leaves reading, with the title focused and Down held to the foot and past it", () => {
    install(false);
    longLesson(4200, -4200);
    title().focus();
    for (let i = 0; i < 60; i += 1) {
      expect(press("ArrowDown", title()), `press ${i}`).toBe(false);
    }
    expect(focused()).toBe("Fractions");
    expect(document.documentElement.scrollTop).toBe(4200);
    expect(press("ArrowUp", title())).toBe(false);
    expect(press("ArrowDown")).toBe(false);
  });

  it("does the same with Up held at the head, where the title is in view", () => {
    install(false);
    longLesson(0, 0);
    title().focus();
    for (let i = 0; i < 30; i += 1) {
      expect(press("ArrowUp", title()), `press ${i}`).toBe(false);
    }
    expect(focused()).toBe("Fractions");
  });

  it("does not teleport with nothing focused at the foot", () => {
    install(false);
    longLesson(4200, -4200);
    expect(press("ArrowDown")).toBe(false);
    expect(press("ArrowUp")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("is not made to navigate by a scroll area under the pointer that has room only the other way", () => {
    install(false);
    render(
      <main>
        <div data-testid="column" style={{ overflowY: "auto" }}>
          <span data-testid="line">text</span>
        </div>
        <button>Go</button>
      </main>,
    );
    size(screen.getByTestId("column"), "scrollHeight", 3000);
    size(screen.getByTestId("column"), "clientHeight", 500);
    place(text("Go"), { left: 0, top: 300, width: 100, height: 50 });
    document.elementFromPoint = (_x, y) =>
      y > 250 ? text("Go") : screen.getByTestId("line");
    document.body.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }),
    );
    expect(press("ArrowDown")).toBe(false);
    expect(press("ArrowRight")).toBe(true);
    expect(focused()).toBe("Go");
    document.elementFromPoint = undefined as never;
  });
});

describe("a TV that is taken for a desktop, on a long page", () => {
  it("scrolls on the first Down, enters the pad on Right, and navigates on the next Down", () => {
    install(false);
    longPage();
    lesson();
    expect(press("ArrowDown")).toBe(false);
    expect(press("ArrowRight")).toBe(true);
    expect(focused()).toBe("Start");
    ring(text("Start"), true);
    expect(press("ArrowDown", text("Start"))).toBe(true);
    expect(focused()).toBe("Next");
  });
});

describe("a sticky header", () => {
  it("is not the first control gone to at the foot of a page, on the pad", () => {
    install(true);
    longPage();
    size(document.documentElement, "scrollTop", 4200);
    render(
      <main>
        <header style={{ position: "sticky" }}>
          <button>logo</button>
        </header>
        <button>content</button>
      </main>,
    );
    place(text("logo"), { left: 0, top: 0, width: 100, height: 50 });
    place(text("content"), { left: 0, top: 300, width: 100, height: 50 });
    expect(press("ArrowDown")).toBe(true);
    expect(focused()).toBe("content");
  });
});
