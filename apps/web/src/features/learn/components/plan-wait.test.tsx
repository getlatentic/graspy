// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_MS } from "@/hooks/use-slow";
import { KeysApp } from "@/test/keys-app";
import { PlanWait } from "./plan-wait";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function wait(pathname: string, chat = false, onRetry = vi.fn()) {
  const view = render(
    <KeysApp>
      <PlanWait pathname={pathname} chat={chat} onRetry={onRetry} />
    </KeysApp>,
  );
  return { ...view, onRetry };
}

describe("PlanWait", () => {
  it("holds the shape of Home while the plan is read, and says once that it is opening", () => {
    const { container } = wait("/app/learn");
    expect(
      container.querySelectorAll("[data-skeleton]").length,
    ).toBeGreaterThan(3);
    expect(container.querySelectorAll("section")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("loading.opening");
    expect(container.querySelector("[aria-busy]")).toBeNull();
  });

  it("holds the shape of a subject page on a subject's path", () => {
    const { container } = wait("/app/learn/mathematics");
    expect(container.querySelectorAll("li")).toHaveLength(5);
  });

  it("holds a plain list on any other page", () => {
    const { container } = wait("/app/learn/you");
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("holds a line in a chat, which has no page shape", () => {
    const { container } = wait("/app/learn/ask/mathematics", true);
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(container.querySelector("[class*='animate-sweep']")).not.toBeNull();
  });

  it("gives way to a title and its action when the server is slow, and the action asks again", () => {
    const { container, onRetry } = wait("/app/learn");
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    // Said once: the status is read, and the title beside the button is for the eye.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const said = screen
      .getAllByText("loading.opening")
      .filter((one) => !one.closest("[aria-hidden=true]"));
    expect(said).toHaveLength(1);
    expect(said[0]!.getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: "loading.tryAgain" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("is a status once, not again when it turns slow", () => {
    wait("/app/learn");
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
