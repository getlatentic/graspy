// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
