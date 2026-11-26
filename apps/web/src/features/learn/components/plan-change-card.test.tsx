// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { PendingPlanChange } from "../hooks/use-tutor-actions";
import { PlanChangeCard } from "./plan-change-card";

function shown(change: PendingPlanChange) {
  const handlers = { onConfirm: vi.fn(), onDismiss: vi.fn() };
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
      <PlanChangeCard change={change} {...handlers} />
    </I18nContext.Provider>,
  );
  return handlers;
}

afterEach(cleanup);

describe("the confirmation of a change that clears progress", () => {
  it("names the subjects that would be removed, and waits for the learner", async () => {
    const { onConfirm, onDismiss } = shown({
      type: "change_subjects",
      names: ["English"],
      removed: ["Mathematics", "Physics"],
    });

    expect(
      screen.getByText(
        "Remove Mathematics, Physics? Their progress is cleared.",
      ),
    ).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, go ahead" }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("asks before the plan is rebuilt", () => {
    shown({ type: "rebuild_plan" });

    expect(
      screen.getByText("Rebuild your plan? Your progress is cleared."),
    ).toBeTruthy();
  });
});
