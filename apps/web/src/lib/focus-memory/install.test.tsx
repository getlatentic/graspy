// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusMemory, setCurrentRoute } from ".";
import { forgetAll } from "./memory";

let remove: () => void;

beforeEach(() => {
  forgetAll();
  setCurrentRoute("/list");
  remove = installFocusMemory(document);
});
afterEach(() => {
  remove();
  cleanup();
});

const flush = () => act(async () => {});
const focused = () => document.activeElement?.textContent;

function List({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  return (
    <main>
      <ul>
        {items.map((name) => (
          <li key={name}>
            <button
              data-focus-key={name}
              onClick={() => setItems(items.filter((n) => n !== name))}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setItems([...items])}>redraw</button>
    </main>
  );
}

async function removeFocused(names: string[], focus: string) {
  render(<List initial={names} />);
  screen.getByRole("button", { name: focus }).focus();
  await act(async () => screen.getByRole("button", { name: focus }).click());
}

describe("when the person lets go of focus", () => {
  it("a click on empty background, then a removal, does not pull focus back", async () => {
    vi.useFakeTimers();
    try {
      render(<List initial={["a", "b", "c"]} />);
      const b = screen.getByRole("button", { name: "b" });
      b.focus();
      b.blur();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      await act(async () => b.click());
      expect(document.activeElement).toBe(document.body);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a control in a dialog", () => {
  it("is not replaced by a neighbour when it goes: the dialog hands focus to its opener", async () => {
    render(
      <main>
        <div role="dialog">
          <button onClick={(e) => e.currentTarget.remove()}>close</button>
          <button>other</button>
        </div>
      </main>,
    );
    screen.getByRole("button", { name: "close" }).focus();
    await act(async () =>
      screen.getByRole("button", { name: "close" }).click(),
    );
    expect(document.activeElement).toBe(document.body);
  });
});

describe("when the focused item is removed", () => {
  it("focus goes to the item that took its place", async () => {
    await removeFocused(["a", "b", "c"], "b");
    expect(focused()).toBe("c");
  });

  it("focus goes to the one before when it was the last", async () => {
    await removeFocused(["a", "b", "c"], "c");
    expect(focused()).toBe("b");
  });

  it("focus goes to the neighbour on either side, not to the page", async () => {
    await removeFocused(["a", "b"], "a");
    expect(focused()).toBe("b");
  });

  it("focus stays on the page when nothing is left", async () => {
    render(
      <main>
        <ul>
          <li>
            <button onClick={(e) => e.currentTarget.parentElement?.remove()}>
              only
            </button>
          </li>
        </ul>
      </main>,
    );
    screen.getByRole("button", { name: "only" }).focus();
    await act(async () => screen.getByRole("button", { name: "only" }).click());
    expect(document.activeElement).toBe(document.body);
  });

  it("does not take focus the app already put somewhere", async () => {
    render(
      <main>
        <button
          onClick={(e) => {
            e.currentTarget.remove();
            screen.getByRole("textbox").focus();
          }}
        >
          go
        </button>
        <input aria-label="name" />
        <button>next</button>
      </main>,
    );
    screen.getByRole("button", { name: "go" }).focus();
    await act(async () => screen.getByRole("button", { name: "go" }).click());
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("leaves a change of screen to the screen's own focus", async () => {
    render(
      <main>
        <button
          onClick={(e) => {
            setCurrentRoute("/other");
            e.currentTarget.remove();
          }}
        >
          leave
        </button>
        <button>neighbour</button>
      </main>,
    );
    screen.getByRole("button", { name: "leave" }).focus();
    await act(async () =>
      screen.getByRole("button", { name: "leave" }).click(),
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("finds the same item again when the list is drawn anew", async () => {
    render(<Redrawn />);
    screen.getByRole("button", { name: "b" }).focus();
    await act(async () =>
      screen.getByRole("button", { name: "redraw" }).click(),
    );
    await flush();
    expect(focused()).toBe("b");
  });
});

/** A list that replaces its elements wholesale (a new key on the wrapper), as a refetch does. */
function Redrawn() {
  const [round, setRound] = useState(0);
  return (
    <main>
      <div key={round}>
        <button data-focus-key="a">a</button>
        <button data-focus-key="b">b</button>
      </div>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setRound(round + 1)}
      >
        redraw
      </button>
    </main>
  );
}

describe("a busy page", () => {
  it("lets 3000 links and a stream of added text pass without moving focus or measuring them", async () => {
    render(
      <main>
        <input aria-label="ask" />
        <div data-testid="log" />
        {Array.from({ length: 3000 }, (_, i) => (
          <a key={i} href={`/l${i}`}>{`l${i}`}</a>
        ))}
      </main>,
    );
    const input = screen.getByLabelText("ask");
    input.focus();
    const log = screen.getByTestId("log");
    const rects = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const styles = vi.spyOn(window, "getComputedStyle");
    await act(async () => {
      for (let i = 0; i < 500; i += 1) {
        log.append(document.createElement("p"));
      }
    });
    expect(document.activeElement).toBe(input);
    expect(rects).not.toHaveBeenCalled();
    expect(styles).not.toHaveBeenCalled();
  });
});
