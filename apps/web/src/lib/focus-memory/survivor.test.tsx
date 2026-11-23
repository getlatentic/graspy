// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
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

describe("a destructive neighbour", () => {
  it("is never the one that gets focus: the one before is taken instead", async () => {
    render(
      <main>
        <ul>
          <li>
            <button>safe</button>
          </li>
          <li>
            <button onClick={(e) => e.currentTarget.parentElement?.remove()}>
              item
            </button>
          </li>
          <li>
            <button data-destructive="">delete</button>
          </li>
        </ul>
      </main>,
    );
    screen.getByRole("button", { name: "item" }).focus();
    await act(async () => screen.getByRole("button", { name: "item" }).click());
    expect(document.activeElement?.textContent).toBe("safe");
  });
});
