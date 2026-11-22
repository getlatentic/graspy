// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningPath } from "@/lib/curriculum-api";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { PathProposal } from "../hooks/use-path-proposal";
import { PlanChangeCard } from "./plan-change-card";

const path = (goal: string): LearningPath => ({
  subject: goal,
  goal,
  steps: [{ title: goal, level: "SS 2" }],
});
const ready = (goal: string): PathProposal => ({
  goal,
  path: path(goal),
  failed: false,
});
const planning = (goal: string): PathProposal => ({
  goal,
  path: null,
  failed: false,
});
const failed = (goal: string): PathProposal => ({
  goal,
  path: null,
  failed: true,
});

function shown(proposals: PathProposal[]) {
  const handlers = {
    onConfirm: vi.fn(),
    onDismiss: vi.fn(),
    onRetry: vi.fn(),
  };
  const chat = en.chat as unknown as Record<string, string>;
  render(
    <I18nContext.Provider
      value={
        {
          t: (key: string, values: Record<string, string | number> = {}) =>
            Object.entries(values).reduce(
              (text, [name, value]) => text.replace(`{${name}}`, String(value)),
              chat[key.split(".")[1]] ?? key,
            ),
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      <PlanChangeCard
        change={{ type: "propose_path", proposals }}
        {...handlers}
      />
    </I18nContext.Provider>,
  );
  return handlers;
}

afterEach(cleanup);

describe("the card of proposed courses", () => {
  it("adds all of them once all are ready", () => {
    shown([ready("A"), ready("B"), ready("C")]);

    expect(screen.getByRole("button", { name: "Add all" })).toBeTruthy();
  });

  it("says what it adds while one is still planning, and never waits for it", async () => {
    const { onConfirm } = shown([ready("A"), ready("B"), planning("C")]);

    await userEvent.click(
      screen.getByRole("button", { name: "Add ready (2 of 3)" }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
  });

  it("offers nothing to add while none is ready, but still lets the learner leave", () => {
    shown([planning("A"), failed("B")]);

    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
  });

  it("names what it adds when one failed", () => {
    shown([ready("A"), ready("B"), failed("C")]);

    expect(
      screen.getByRole("button", { name: "Add ready (2 of 3)" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add all" })).toBeNull();
  });

  it("adds a single course that is ready as this path", () => {
    shown([ready("A")]);

    expect(screen.getByRole("button", { name: "Add this path" })).toBeTruthy();
  });

  it("lets a failed course be tried again", async () => {
    const { onRetry } = shown([ready("A"), failed("B")]);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledWith("B");
    expect(
      screen.getByRole("button", { name: "Add ready (1 of 2)" }),
    ).toBeTruthy();
  });
});
