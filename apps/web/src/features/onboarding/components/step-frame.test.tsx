// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeysApp } from "@/test/keys-app";
import { StepFooter, StepHeading } from "./step-frame";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const footer = (canNext: boolean) =>
  render(
    <KeysApp>
      <StepFooter
        onNext={() => undefined}
        nextLabel="Next"
        canNext={canNext}
        busy={false}
      />
    </KeysApp>,
  );

describe("the action row of a step", () => {
  it("is a sticky bar that knows when it is held up, so its fade shows only then", () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = footer(true);
    const bar = container.querySelector("[data-stuck]") as HTMLElement;
    expect(bar.classList.contains("sticky")).toBe(true);
    expect(bar.className).toContain("env(safe-area-inset-bottom)");
    expect(bar.className).toContain("split:static");
    expect(bar.getAttribute("data-stuck")).toBe("false");
    act(() => report([{ isIntersecting: false }]));
    expect(bar.getAttribute("data-stuck")).toBe("true");
    act(() => report([{ isIntersecting: true }]));
    expect(bar.getAttribute("data-stuck")).toBe("false");
  });

  it("keeps a disabled Next legible: translucent white, muted ink and an outline, not a faded blue", () => {
    footer(false);
    const next = screen.getByRole("button", { name: /Next/ });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    for (const name of [
      "disabled:bg-surface/60",
      "disabled:text-muted",
      "disabled:opacity-100",
      "disabled:ring-1",
    ]) {
      expect(next.classList.contains(name), name).toBe(true);
    }
  });
});

describe("the step heading", () => {
  const heading = (step: "profile" | "subjects") => (
    <KeysApp>
      <StepHeading step={step} index={step === "profile" ? 0 : 1} count={2} />
    </KeysApp>
  );

  it("is the page's title, reachable by a program", () => {
    render(heading("profile"));
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.id).toBe("page-title");
    expect(title.getAttribute("tabindex")).toBe("-1");
  });

  it("takes focus on a new step, and not on the first", () => {
    const { rerender } = render(heading("profile"));
    expect(document.activeElement).toBe(document.body);
    rerender(heading("subjects"));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
  });
});
