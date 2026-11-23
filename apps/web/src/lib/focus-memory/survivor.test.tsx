// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { place } from "@/test/layout";
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

describe("a neighbour that takes focus", () => {
  function list(neighbourTop: number) {
    render(
      <main>
        <div data-testid="area" style={{ overflowY: "auto" }}>
          <button onClick={(e) => e.currentTarget.remove()}>gone</button>
          <button>next</button>
        </div>
      </main>,
    );
    place(screen.getByTestId("area"), {
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    });
    place(screen.getByText("gone"), {
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    });
    place(screen.getByText("next"), {
      left: 0,
      top: neighbourTop,
      width: 100,
      height: 50,
    });
    screen.getByText("gone").focus();
  }

  it("is scrolled to when it is near the view", async () => {
    list(300);
    await act(async () => screen.getByText("gone").click());
    expect(document.activeElement?.textContent).toBe("next");
    expect(screen.getByTestId("area").scrollTop).toBeGreaterThan(0);
  });

  it("is not scrolled to when the reader has scrolled far away from it", async () => {
    list(9000);
    await act(async () => screen.getByText("gone").click());
    expect(document.activeElement?.textContent).toBe("next");
    expect(screen.getByTestId("area").scrollTop).toBe(0);
  });
});
