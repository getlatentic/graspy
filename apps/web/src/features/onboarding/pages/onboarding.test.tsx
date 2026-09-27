// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerApp } from "@/test/learner-app";
import { loadedPlan } from "@/test/learner";
import type { DetailsSchema } from "../schemas/onboarding-schema";
import OnboardingPage from "./onboarding";

// A plan that stopped before it was kept, back on the form.
vi.mock("../hooks/use-plan-setup", () => ({
  usePlanSetup: () => ({
    phase: "form",
    error: "stopped",
    busy: false,
    start: () => Promise.resolve(),
  }),
}));
vi.mock("../hooks/use-subject-choices", () => ({
  useSubjectChoices: () => ({ available: [], loading: false, error: null }),
}));
// The fields themselves are not what is tested.
vi.mock("../components/steps/profile-step", () => ({ default: () => null }));
vi.mock("../components/steps/subjects-step", () => ({ default: () => null }));

// As chosen from the catalogue, which says whether the class learns by voice alone.
const inClass = (level: string, voiceOnly: boolean): DetailsSchema => ({
  country: "NG",
  language: "en",
  system: "NG",
  level,
  school: { names: { en: level }, descriptor: level, voiceOnly },
  course: "",
});

/** The form a learner changing their details comes back to. */
function replanning(details: DetailsSchema) {
  render(
    <LearnerApp
      plan={loadedPlan()}
      at={{ pathname: "/app/onboarding", state: { replan: details } }}
    >
      <OnboardingPage />
    </LearnerApp>,
  );
}

afterEach(cleanup);

describe("Onboarding after a plan stopped", () => {
  it("tells a class that learns by voice alone its plan was not kept, and offers to try again", () => {
    replanning(inClass("nursery-2", true));

    expect(screen.getByRole("alert").textContent).toBe(
      "onboarding.generating.failed",
    );
    expect(screen.getByText("onboarding.generating.tryAgain")).toBeTruthy();
  });

  it("says nothing on the last step of a class that chooses subjects", () => {
    replanning(inClass("primary-2", false));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
