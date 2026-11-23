// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusMemory } from "@/lib/focus-memory";
import { forgetAll } from "@/lib/focus-memory/memory";
import { RootLayout } from "./route-focus";

let remove: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  forgetAll();
  remove = installFocusMemory(document);
});
afterEach(() => {
  remove();
  cleanup();
  vi.useRealTimers();
});

const SUBJECTS = ["maths", "english", "science"];

let gone: string | null = null;

const List = () => (
  <main>
    <h1>subjects</h1>
    {SUBJECTS.filter((s) => s !== gone).map((s) => (
      <Link key={s} to={`/${s}`}>
        {s}
      </Link>
    ))}
    <button data-focus-key="more">more</button>
  </main>
);
const Detail = () => (
  <main>
    <h1>detail</h1>
  </main>
);
function app() {
  const router = createMemoryRouter(
    [
      {
        Component: RootLayout,
        children: [
          { path: "/", Component: List },
          { path: "/maths", Component: Detail },
          { path: "/english", Component: Detail },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("coming back to a screen", () => {
  it("puts focus on the item that had it, found by its link, not on the title", async () => {
    const router = app();
    await act(() => vi.advanceTimersByTimeAsync(100));
    screen.getByRole("link", { name: "english" }).focus();
    await act(() => router.navigate("/english"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(document.activeElement).toBe(screen.getByRole("heading"));

    await act(() => router.navigate(-1));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "english" }),
    );
  });

  it("uses a data-focus-key for what is not a link", async () => {
    const router = app();
    await act(() => vi.advanceTimersByTimeAsync(100));
    screen.getByRole("button", { name: "more" }).focus();
    await act(() => router.navigate("/maths"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    await act(() => router.navigate(-1));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "more" }),
    );
  });

  it("starts at the title when the screen is reached by a new step, not by going back", async () => {
    const router = app();
    await act(() => vi.advanceTimersByTimeAsync(100));
    screen.getByRole("link", { name: "english" }).focus();
    await act(() => router.navigate("/maths"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    await act(() => router.navigate("/"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });

  it("falls back to the title after about a second when the remembered item never comes back", async () => {
    const router = app();
    await act(() => vi.advanceTimersByTimeAsync(100));
    screen.getByRole("link", { name: "science" }).focus();
    await act(() => router.navigate("/maths"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    gone = "science";
    await act(() => router.navigate(-1));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(document.activeElement).toBe(document.body);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    gone = null;
  });
});
