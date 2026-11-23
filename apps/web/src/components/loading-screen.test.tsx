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
import { LoadingBar, LoadingScreen, SlowRetry } from "./loading-screen";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LoadingScreen", () => {
  function open(onRetry = vi.fn()) {
    const view = render(
      <KeysApp>
        <LoadingScreen onRetry={onRetry} />
      </KeysApp>,
    );
    return { ...view, onRetry };
  }

  it("is the logo and a progress line, on the canvas colour", () => {
    const { container } = open();
    const main = container.querySelector("main")!;
    expect(main.className).toContain("bg-canvas");
    // Busy would mute the status inside it.
    expect(main.hasAttribute("aria-busy")).toBe(false);
    const logo = container.querySelector("img")!;
    expect(logo.getAttribute("src")).toBe("/brand/graspy-lockup-v1.svg");
    expect(logo.getAttribute("width")).toBe("4552");
    expect(logo.getAttribute("height")).toBe("836");
    expect(
      container.querySelector(".animate-sweep, [class*='animate-sweep']"),
    ).not.toBeNull();
  });

  it("announces itself once, in one status, and says nothing else in words", () => {
    const { container } = open();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("loading.opening");
    expect(container.textContent).toBe("loading.opening");
    expect(
      container.querySelector("[role=status]")!.closest("[aria-busy]"),
    ).toBeNull();
  });

  it("keeps its parts where they were when the line gives way to the button", () => {
    const { container } = open();
    const slot = container.querySelector(".h-12")!;
    expect(slot.querySelector("button")).toBeNull();
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(container.querySelector(".h-12")).toBe(slot);
    expect(slot.querySelector("button")).not.toBeNull();
    expect(slot.querySelector("[class*='animate-sweep']")).toBeNull();
  });

  it("offers another try only after the server has been silent for a while, and then tries", () => {
    const { onRetry } = open();
    act(() => vi.advanceTimersByTime(SLOW_MS - 1));
    expect(screen.queryByRole("button")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole("button", { name: "loading.tryAgain" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not announce a second time when the button appears", () => {
    open();
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("SlowRetry", () => {
  it("is a title and its action, and nothing more", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <KeysApp>
        <SlowRetry onRetry={onRetry} />
      </KeysApp>,
    );
    expect(container.textContent).toBe("loading.openingloading.tryAgain");
    expect(container.querySelector("p")!.getAttribute("aria-hidden")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("LoadingBar", () => {
  it("is for the eye only, and keeps still for those who ask for less motion", () => {
    const { container } = render(<LoadingBar />);
    expect(
      (container.firstChild as HTMLElement).getAttribute("aria-hidden"),
    ).toBe("true");
    const sweep = container.querySelector(
      "[class*='animate-sweep']",
    ) as HTMLElement;
    expect(sweep.className).toContain("motion-safe:animate-sweep");
    expect(sweep.className).toContain("motion-reduce:ml-9");
  });
});
