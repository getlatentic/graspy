// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place, placeGrid } from "@/test/layout";
import { installSpatialNav } from "./install";

let remove: () => void;
const scrolled = vi.fn();

beforeEach(() => {
  remove = installSpatialNav(document);
  Element.prototype.scrollIntoView = scrolled;
  Object.defineProperty(window, "innerWidth", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 800,
    configurable: true,
  });
});
afterEach(() => {
  remove();
  cleanup();
  scrolled.mockReset();
  document.documentElement.removeAttribute("style");
});

const names = ["a", "b", "c", "d", "e", "f"];
function Grid() {
  return (
    <main>
      {names.map((n) => (
        <button key={n}>{n}</button>
      ))}
    </main>
  );
}
const button = (name: string) => screen.getByRole("button", { name });
const focused = () => document.activeElement?.textContent;

function gridOfSix() {
  render(<Grid />);
  placeGrid(names.map(button), 3);
  button("a").focus();
}

describe("arrow keys on a grid", () => {
  it("move focus right, left, down and up, and stop at the edge", async () => {
    const user = userEvent.setup();
    gridOfSix();
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("b");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("e");
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("d");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("a");
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("a");
  });

  it("scrolls the new control into view by the least distance, in the scroll area that holds it", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <div data-testid="area" style={{ overflowY: "auto" }}>
          <button>top</button>
          <button>low</button>
        </div>
      </main>,
    );
    const area = screen.getByTestId("area");
    place(area, { left: 0, top: 0, width: 300, height: 200 });
    place(button("top"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("low"), { left: 0, top: 230, width: 100, height: 50 });
    button("top").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("top");
    place(button("low"), { left: 0, top: 170, width: 100, height: 60 });
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("low");
    expect(area.scrollTop).toBe(30);
  });

  it("never scrolls an overflow: hidden box to show a control", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <div data-testid="clip" style={{ overflowY: "hidden" }}>
          <button>top</button>
          <button>low</button>
        </div>
      </main>,
    );
    place(screen.getByTestId("clip"), {
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    });
    place(button("top"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("low"), { left: 0, top: 170, width: 100, height: 60 });
    button("top").focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("clip").scrollTop).toBe(0);
  });

  it("leaves the key to the page when nothing lies that way", async () => {
    gridOfSix();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    button("a").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(focused()).toBe("a");
  });

  it("takes the key when it moves focus", () => {
    gridOfSix();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    button("a").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("goes by where things are, not by the order in the page", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button>one</button>
        <button>two</button>
        <button>three</button>
      </main>,
    );
    place(button("one"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("two"), { left: 0, top: 400, width: 100, height: 50 });
    place(button("three"), { left: 0, top: 100, width: 100, height: 50 });
    button("one").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("three");
  });

  it("skips controls that are disabled, hidden, inert, off the tab order or opted out", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button>start</button>
        <button disabled>disabled</button>
        <button style={{ visibility: "hidden" }}>hidden</button>
        <div inert>
          <button>inert</button>
        </div>
        <div aria-hidden="true">
          <button>aria hidden</button>
        </div>
        <button tabIndex={-1}>roving</button>
        <div data-nav-skip="">
          <button>skipped</button>
        </div>
        <button>end</button>
      </main>,
    );
    const all = screen.getAllByRole("button", { hidden: true });
    all.forEach((el, i) =>
      place(el, { left: 0, top: i * 60, width: 100, height: 50 }),
    );
    button("start").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("end");
  });

  it("never takes a control with no area, such as a skip link kept off screen", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button>start</button>
        <a href="#main">skip</a>
        <button>end</button>
      </main>,
    );
    place(button("start"), { left: 0, top: 0, width: 100, height: 50 });
    place(screen.getByRole("link"), { left: 0, top: 60, width: 1, height: 1 });
    place(button("end"), { left: 0, top: 120, width: 100, height: 50 });
    button("start").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("end");
  });
});

describe("arrow keys with nothing focused", () => {
  it("focus the first control in view, in reading order", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    placeGrid(names.map(button), 3);
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("a");
  });

  it("go to a control below the fold, scrolled to, where the browser may not scroll on arrows", async () => {
    render(
      <main>
        <button>far</button>
      </main>,
    );
    place(button("far"), { left: 0, top: 5000, width: 100, height: 50 });
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(focused()).toBe("far");
  });

  it("start from a focused heading, which is not a control", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <h1 tabIndex={-1}>title</h1>
        <button>below</button>
      </main>,
    );
    place(screen.getByRole("heading"), {
      left: 0,
      top: 0,
      width: 300,
      height: 40,
    });
    place(button("below"), { left: 0, top: 100, width: 100, height: 50 });
    screen.getByRole("heading").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("below");
  });
});

describe("keys that belong to something else", () => {
  it("are left alone in a text field, a text area and an editable region", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <input aria-label="name" />
        <textarea aria-label="note" />
        <div
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          aria-label="rich"
        />
        <button>below</button>
      </main>,
    );
    const fields = [
      screen.getByLabelText("name"),
      screen.getByLabelText("note"),
      screen.getByLabelText("rich"),
    ];
    fields.forEach((el, i) =>
      place(el, { left: 0, top: i * 60, width: 100, height: 50 }),
    );
    // jsdom does not implement isContentEditable.
    Object.defineProperty(fields[2], "isContentEditable", { value: true });
    place(button("below"), { left: 0, top: 200, width: 100, height: 50 });
    for (const field of fields) {
      field.focus();
      await user.keyboard("{ArrowDown}{ArrowRight}");
      expect(document.activeElement).toBe(field);
    }
  });

  it("are left alone on a slider, a radio, a native select and a focused area that can scroll", async () => {
    // user-event looks up radios with CSS.escape, which jsdom lacks.
    (globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s };
    const user = userEvent.setup();
    render(
      <main>
        <input type="range" aria-label="volume" />
        <input type="radio" name="r" aria-label="choice" />
        <input type="radio" name="r" aria-label="other" />
        <select aria-label="pick">
          <option>x</option>
          <option>y</option>
        </select>
        <div tabIndex={0} aria-label="log" style={{ overflowY: "auto" }} />
        <button>below</button>
      </main>,
    );
    const owners = [
      screen.getByLabelText("volume"),
      screen.getByLabelText("choice"),
      screen.getByLabelText("pick"),
      screen.getByLabelText("log"),
    ];
    place(screen.getByLabelText("other"), {
      left: 300,
      top: 0,
      width: 50,
      height: 50,
    });
    owners.forEach((el, i) =>
      place(el, { left: 0, top: i * 60, width: 100, height: 50 }),
    );
    place(button("below"), { left: 0, top: 300, width: 100, height: 50 });
    const log = owners[3];
    Object.defineProperty(log, "scrollHeight", {
      value: 900,
      configurable: true,
    });
    Object.defineProperty(log, "clientHeight", {
      value: 100,
      configurable: true,
    });
    for (const el of owners) {
      el.focus();
      await user.keyboard("{ArrowDown}");
      // A radio moves to the next one of its group natively; none goes to the button below.
      expect(document.activeElement).not.toBe(button("below"));
    }
  });

  it("are left alone when a control handled them (it called preventDefault)", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button onKeyDown={(e) => e.preventDefault()}>own</button>
        <button>next</button>
      </main>,
    );
    place(button("own"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("next"), { left: 0, top: 100, width: 100, height: 50 });
    button("own").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("own");
  });

  it("are left alone in an open combobox, and in an area marked data-nav-skip", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button role="combobox" aria-expanded="true" aria-controls="x">
          open
        </button>
        <div data-nav-skip="">
          <button>inside</button>
        </div>
        <button>below</button>
      </main>,
    );
    place(screen.getByRole("combobox"), {
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    });
    place(button("inside"), { left: 0, top: 60, width: 100, height: 50 });
    place(button("below"), { left: 0, top: 120, width: 100, height: 50 });
    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("open");
    button("inside").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("inside");
  });

  it("are left alone with a modifier held (a chord is the browser's or a field's)", async () => {
    const user = userEvent.setup();
    gridOfSix();
    for (const modifier of ["Shift", "Control", "Alt", "Meta"]) {
      await user.keyboard(`{${modifier}>}{ArrowRight}{/${modifier}}`);
      expect(focused()).toBe("a");
    }
  });
});

describe("a held key", () => {
  it("moves on repeat, no faster than one step every 70 ms", () => {
    vi.useFakeTimers();
    try {
      gridOfSix();
      const press = (repeat: boolean) =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            repeat,
            bubbles: true,
            cancelable: true,
          }),
        );
      press(false);
      expect(focused()).toBe("b");
      vi.advanceTimersByTime(30);
      press(true);
      expect(focused()).toBe("b");
      vi.advanceTimersByTime(60);
      press(true);
      expect(focused()).toBe("c");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("dialogs and lists", () => {
  it("keep arrow navigation inside an open dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <main>
          <button>behind</button>
        </main>
        <div role="dialog" aria-modal="true" aria-label="sheet">
          <button>yes</button>
          <button>no</button>
        </div>
      </>,
    );
    place(button("behind"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("yes"), { left: 0, top: 100, width: 100, height: 50 });
    place(button("no"), { left: 0, top: 200, width: 100, height: 50 });
    button("no").focus();
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("yes");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("yes");
  });

  it("start inside an open dialog when focus is still on the page behind it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <main>
          <button>behind</button>
        </main>
        <div role="dialog" aria-modal="true" aria-label="sheet">
          <button>yes</button>
        </div>
      </>,
    );
    place(button("behind"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("yes"), { left: 0, top: 100, width: 100, height: 50 });
    button("behind").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("yes");
  });

  it("do not trap focus in a dialog marked aria-modal=false", async () => {
    const user = userEvent.setup();
    render(
      <>
        <main>
          <button>behind</button>
        </main>
        <div role="dialog" aria-modal="false" aria-label="note">
          <button>inside</button>
        </div>
      </>,
    );
    place(button("behind"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("inside"), { left: 0, top: 100, width: 100, height: 50 });
    button("inside").focus();
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("behind");
  });
});

describe("a data-nav-group", () => {
  function Chips() {
    return (
      <main>
        <div data-nav-group="">
          <button>one</button>
          <button>two</button>
        </div>
        <button>other</button>
      </main>
    );
  }

  it("is stepped through first, even when something outside is nearer, and left at its edge", async () => {
    const user = userEvent.setup();
    render(<Chips />);
    place(button("one"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("two"), { left: 150, top: 80, width: 100, height: 50 });
    place(button("other"), { left: 0, top: 60, width: 100, height: 50 });
    button("one").focus();
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("two");
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("one");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("two");
    button("two").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("two");
  });
});

describe("roving groups (tabs, option lists)", () => {
  it("count as one stop: the member that is tabbable", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <button>before</button>
        <div role="tablist" aria-orientation="horizontal">
          <button role="tab" tabIndex={0}>
            first
          </button>
          <button role="tab" tabIndex={-1}>
            second
          </button>
        </div>
        <button>after</button>
      </main>,
    );
    place(button("before"), { left: 0, top: 0, width: 100, height: 50 });
    place(screen.getByRole("tab", { name: "first" }), {
      left: 0,
      top: 100,
      width: 100,
      height: 50,
    });
    place(screen.getByRole("tab", { name: "second" }), {
      left: 120,
      top: 100,
      width: 100,
      height: 50,
    });
    place(button("after"), { left: 0, top: 200, width: 100, height: 50 });
    button("before").focus();
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("first");
    await new Promise((r) => setTimeout(r, 90));
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("after");
  });

  it("let the group move first: its own Left and Right win, then the key goes on at its edge", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <div
          role="tablist"
          onKeyDown={(e) => {
            const tabs = [
              ...e.currentTarget.querySelectorAll<HTMLElement>("[role=tab]"),
            ];
            const at = tabs.indexOf(document.activeElement as HTMLElement);
            const next = tabs[at + (e.key === "ArrowRight" ? 1 : -1)];
            if (!next) return;
            e.preventDefault();
            tabs.forEach((t) => (t.tabIndex = t === next ? 0 : -1));
            next.focus();
          }}
        >
          <button role="tab" tabIndex={0}>
            first
          </button>
          <button role="tab" tabIndex={-1}>
            second
          </button>
        </div>
        <button>beyond</button>
      </main>,
    );
    place(screen.getByRole("tab", { name: "first" }), {
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    });
    place(screen.getByRole("tab", { name: "second" }), {
      left: 120,
      top: 0,
      width: 100,
      height: 50,
    });
    place(button("beyond"), { left: 260, top: 0, width: 100, height: 50 });
    screen.getByRole("tab", { name: "first" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("second");
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("beyond");
  });
});

describe("right-to-left layouts", () => {
  it("go to the control that is physically to the left, which is the next one when the writing runs right to left", async () => {
    const user = userEvent.setup();
    render(
      <main dir="rtl">
        <button>first</button>
        <button>second</button>
      </main>,
    );
    place(button("first"), { left: 200, top: 0, width: 100, height: 50 });
    place(button("second"), { left: 80, top: 0, width: 100, height: 50 });
    button("first").focus();
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("second");
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("first");
  });

  it("start from the right with nothing focused", async () => {
    const user = userEvent.setup();
    document.documentElement.style.direction = "rtl";
    render(
      <main>
        <button>left</button>
        <button>right</button>
      </main>,
    );
    place(button("left"), { left: 0, top: 0, width: 100, height: 50 });
    place(button("right"), { left: 200, top: 0, width: 100, height: 50 });
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("right");
  });
});

describe("many controls", () => {
  it("measures each control once per key and checks few for visibility", () => {
    const count = 600;
    render(
      <main>
        {Array.from({ length: count }, (_, i) => (
          <button key={i}>{`n${i}`}</button>
        ))}
      </main>,
    );
    const all = screen.getAllByRole("button");
    placeGrid(all, 20, 60, 50);
    const measured = vi.fn();
    all.forEach((el) => {
      const rect = el.getBoundingClientRect;
      el.getBoundingClientRect = () => {
        measured();
        return rect.call(el);
      };
    });
    const first = button("n0");
    const styles = vi.spyOn(window, "getComputedStyle");
    first.focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(focused()).toBe("n20");
    expect(measured.mock.calls.length).toBeLessThanOrEqual(count + 30);
    expect(styles.mock.calls.length).toBeLessThan(120);
  });
});
