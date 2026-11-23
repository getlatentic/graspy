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
const at = (el: Element, top: number, left = 0, w = 100, h = 50) =>
  place(el, { left, top, width: w, height: h });
const focused = () => document.activeElement?.textContent;

describe("a header or bar that stays on screen", () => {
  it("does not capture Up from content far below it", () => {
    render(
      <main>
        <header style={{ position: "fixed" }}>
          <button>menu</button>
        </header>
        <button>content</button>
      </main>,
    );
    at(button("menu"), 0);
    at(button("content"), 500);
    button("content").focus();
    expect(press("ArrowUp", button("content"))).toBe(false);
    expect(focused()).toBe("content");
  });

  it("does not capture Down from content far above a fixed button at the foot", () => {
    render(
      <main>
        <button>content</button>
        <button style={{ position: "fixed" }}>chat</button>
      </main>,
    );
    at(button("content"), 100);
    at(button("chat"), 700);
    button("content").focus();
    expect(press("ArrowDown", button("content"))).toBe(false);
    expect(focused()).toBe("content");
  });

  it("is reached when it is directly next to the focus, or the focus is in it", () => {
    render(
      <main>
        <header style={{ position: "fixed" }}>
          <button>menu</button>
          <button>search</button>
        </header>
        <button>content</button>
      </main>,
    );
    at(button("menu"), 0);
    at(button("search"), 0, 150);
    at(button("content"), 58);
    button("content").focus();
    expect(press("ArrowUp", button("content"))).toBe(true);
    expect(focused()).toBe("menu");
    expect(press("ArrowRight", button("menu"))).toBe(true);
    expect(focused()).toBe("search");
  });

  it("is reached by a sticky header while the page is not scrolled", () => {
    render(
      <main>
        <header style={{ position: "sticky" }}>
          <button>menu</button>
        </header>
        <button>content</button>
      </main>,
    );
    at(button("menu"), 0);
    at(button("content"), 500);
    button("content").focus();
    expect(press("ArrowUp", button("content"))).toBe(true);
    expect(focused()).toBe("menu");
  });

  it("is never reached when marked data-nav-skip", () => {
    render(
      <main>
        <header data-nav-skip="" style={{ position: "sticky" }}>
          <button>menu</button>
        </header>
        <button>content</button>
      </main>,
    );
    at(button("menu"), 0);
    at(button("content"), 60);
    button("content").focus();
    expect(press("ArrowUp", button("content"))).toBe(false);
  });
});

describe("a control that is visually hidden", () => {
  function choices() {
    render(
      <main>
        <button>above</button>
        <fieldset>
          {["30", "90"].map((days) => (
            <label key={days}>
              <input
                type="radio"
                name="retention"
                value={days}
                aria-label={`${days} days`}
              />
              <span>{days} days</span>
            </label>
          ))}
        </fieldset>
        <button>below</button>
      </main>,
    );
    at(button("above"), 0);
    const radios = screen.getAllByRole("radio");
    const labels = radios.map((r) => r.closest("label")!);
    labels.forEach((l, i) => at(l, 100, i * 150));
    radios.forEach((r, i) =>
      place(r, { left: i * 150, top: 100, width: 1, height: 1 }),
    );
    at(button("below"), 200);
    return radios;
  }

  it("is a target, stood for by its label", () => {
    const [first] = choices();
    button("above").focus();
    expect(press("ArrowDown", button("above"))).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("is an origin, stood for by its label", () => {
    const [, second] = choices();
    second.focus();
    expect(press("ArrowDown", second)).toBe(true);
    expect(focused()).toBe("below");
  });
});

describe("a busy page", () => {
  it("reads about a viewport's worth of 3000 links, not all of them", () => {
    render(
      <main>
        {Array.from({ length: 3000 }, (_, i) => (
          <a key={i} href={`/l${i}`}>{`l${i}`}</a>
        ))}
      </main>,
    );
    const page = document.documentElement;
    page.scrollTop = 44900;
    const links = screen.getAllByRole("link");
    let rects = 0;
    links.forEach((el, i) => {
      el.getBoundingClientRect = () => {
        rects += 1;
        const top = i * 30 - page.scrollTop;
        const r = { left: 0, top, width: 100, height: 20 };
        return {
          ...r,
          right: 100,
          bottom: top + 20,
          x: 0,
          y: top,
          toJSON: () => r,
        };
      };
    });
    const mid = links[1500];
    mid.focus();
    rects = 0;
    expect(press("ArrowDown", mid)).toBe(true);
    expect(focused()).toBe("l1501");
    expect(rects).toBeLessThan(400);
    page.scrollTop = 0;
  });
});

describe("a clipped control", () => {
  it("that is absolutely placed outside its clipper's containing block is not cut away by it", () => {
    render(
      <main>
        <button>start</button>
        <div style={{ position: "relative" }}>
          <div
            data-testid="clip"
            style={{ overflowX: "hidden", overflowY: "hidden" }}
          >
            <button style={{ position: "absolute" }}>popover</button>
          </div>
        </div>
      </main>,
    );
    at(button("start"), 0);
    at(button("popover"), 100);
    place(screen.getByTestId("clip"), {
      left: 0,
      top: 0,
      width: 100,
      height: 10,
    });
    button("start").focus();
    expect(press("ArrowDown", button("start"))).toBe(true);
    expect(focused()).toBe("popover");
  });

  it("that is plainly placed is cut away by it", () => {
    render(
      <main>
        <button>start</button>
        <div
          data-testid="clip"
          style={{ overflowX: "hidden", overflowY: "hidden" }}
        >
          <button>inside</button>
        </div>
      </main>,
    );
    at(button("start"), 0);
    at(button("inside"), 100);
    place(screen.getByTestId("clip"), {
      left: 0,
      top: 0,
      width: 100,
      height: 10,
    });
    button("start").focus();
    expect(press("ArrowDown", button("start"))).toBe(false);
  });
});
