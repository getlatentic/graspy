// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import { StepFooter } from "./step-frame";

afterEach(cleanup);

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
  it("stays at the foot of the screen below lg (over a fade on a phone), and is part of the page from lg", () => {
    const { container } = footer(true);
    const bar = container.firstElementChild;
    for (const name of [
      "sticky",
      "bottom-0",
      "bg-linear-to-t",
      "sm:bg-none",
      "lg:static",
    ]) {
      expect(bar?.classList.contains(name), name).toBe(true);
    }
    expect(bar?.className).toContain("env(safe-area-inset-bottom)");
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
