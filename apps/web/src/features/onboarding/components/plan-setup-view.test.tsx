// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import type { usePlanSetup } from "../hooks/use-plan-setup";
import PlanSetupView from "./plan-setup-view";

afterEach(cleanup);

type Setup = ReturnType<typeof usePlanSetup>;

const setup = (over: Record<string, unknown>): Setup =>
  ({
    phase: "generating",
    step: "details",
    error: null,
    subjectNames: ["Maths"],
    pending: false,
    retry: () => undefined,
    reset: () => undefined,
    stats: { subjectCount: 1, topicCount: 4 },
    ...over,
  }) as unknown as Setup;

const view = (state: Setup) => (
  <KeysApp>
    <PlanSetupView setup={state} onContinue={() => undefined} />
  </KeysApp>
);

const title = () => screen.getByRole("heading", { level: 1 });

describe("the plan setup screen's focus", () => {
  it("starts on its title, which is the page's one h1", () => {
    render(view(setup({})));
    expect(title().id).toBe("page-title");
    expect(document.activeElement).toBe(title());
  });

  it("keeps focus off the page when Try again takes the retry buttons away", () => {
    const { rerender } = render(view(setup({ error: "stopped" })));
    const retry = screen.getByText("onboarding.generating.tryAgain");
    retry.focus();
    expect(document.activeElement).toBe(retry);
    rerender(view(setup({ error: null })));
    expect(screen.queryByText("onboarding.generating.tryAgain")).toBeNull();
    expect(document.activeElement).toBe(title());
  });

  it("does not take focus from the buttons when a failure first shows", () => {
    const { rerender } = render(view(setup({})));
    rerender(view(setup({ error: "stopped" })));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(title());
  });

  it("moves to the new title when the plan is ready, and says so in a live region that was already there", () => {
    const { rerender } = render(view(setup({})));
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");
    const oldTitle = title();
    rerender(view(setup({ phase: "ready" })));
    expect(title()).not.toBe(oldTitle);
    expect(document.activeElement).toBe(title());
    expect(title().textContent).toBe("onboarding.ready.title");
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toBe("onboarding.ready.title");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
