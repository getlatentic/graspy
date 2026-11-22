// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootLayout } from "./route-focus";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const A = () => (
  <main>
    <a href="#top">skip</a>
    <h1>first</h1>
  </main>
);
const B = () => (
  <main>
    <h1>second</h1>
  </main>
);
const WithControl = () => (
  <main>
    <h1>third</h1>
    <button autoFocus>go</button>
  </main>
);
const Bare = () => <main>no title</main>;

function app() {
  const router = createMemoryRouter([
    {
      Component: RootLayout,
      children: [
        { path: "/", Component: A },
        { path: "/b", Component: B },
        { path: "/control", Component: WithControl },
        { path: "/bare", Component: Bare },
      ],
    },
  ]);
  render(<RouterProvider router={router} />);
  return router;
}

describe("the focus of a new screen", () => {
  it("leaves the first screen alone, so the first Tab still lands on the first link", async () => {
    app();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(document.activeElement).toBe(document.body);
  });

  it("moves to the title of a screen reached by navigating", async () => {
    const router = app();
    await act(() => router.navigate("/b"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "second" }),
    );
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves focus where the screen already put it on a control", async () => {
    const router = app();
    await act(() => router.navigate("/control"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(document.activeElement).toBe(screen.getByText("go"));
  });

  it("gives up after about a second on a screen with no title, and stops looking", async () => {
    const router = app();
    await act(() => router.navigate("/bare"));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(document.activeElement).toBe(document.body);
    expect(vi.getTimerCount()).toBe(0);
  });
});
