import { describe, expect, it, vi } from "vitest";
import type { OnboardingSchema } from "../schemas/onboarding-schema";
import {
  FORM_SHOWN,
  keepAtOnce,
  planRequest,
  planSetupReducer,
  startSetup,
  type PlanSetupEvent,
  type PlanSetupState,
} from "./plan-setup-state";

const stats = { subjectCount: 2, topicCount: 9 };

const inClass = (level: string): OnboardingSchema => ({
  country: "NG",
  language: "en",
  system: "NG",
  level,
  school: { names: { en: level }, descriptor: `${level}, Nigeria` },
  course: "",
  selectedSubjects: ["maths"],
});

describe("startSetup", () => {
  it("keeps the plan at once for a class that learns by voice alone", () => {
    const run = { keep: vi.fn(() => "kept"), make: vi.fn(() => "made") };

    expect(startSetup(inClass("kindergarten"), run)).toBe("kept");
    expect(run.make).not.toHaveBeenCalled();
  });

  it("makes a plan from the subjects for any other class", () => {
    const run = { keep: vi.fn(() => "kept"), make: vi.fn(() => "made") };

    expect(startSetup(inClass("primary-2"), run)).toBe("made");
    expect(run.keep).not.toHaveBeenCalled();
  });
});

describe("keepAtOnce", () => {
  const shown = async (keep: () => Promise<void>) => {
    const events: PlanSetupEvent[] = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await keepAtOnce(keep, (event) => events.push(event));
    return events.reduce(planSetupReducer, {
      ...FORM_SHOWN,
      error: "an earlier try",
    });
  };

  it("leaves the form once the plan is kept", async () => {
    expect(await shown(async () => undefined)).toEqual({
      ...FORM_SHOWN,
      phase: "kept",
    });
  });

  it("stays on the form, saying the plan was not kept, when keeping fails", async () => {
    const state = await shown(() => Promise.reject(new Error("storage full")));

    expect(state).toEqual({ ...FORM_SHOWN, error: "storage full" });
  });
});

describe("planSetupReducer", () => {
  it("goes from the form through the timeline to a ready plan", () => {
    let state = planSetupReducer(FORM_SHOWN, { type: "started" });
    expect(state).toEqual({ ...FORM_SHOWN, phase: "generating" });

    state = planSetupReducer(state, { type: "paced", index: 1 });
    expect(state.step).toBe("generating");
    state = planSetupReducer(state, { type: "made", stats });
    state = planSetupReducer(state, { type: "saved" });
    expect(state).toEqual({
      phase: "ready",
      step: "personalizing",
      stats,
      error: null,
    });
  });

  it("never moves the timeline back", () => {
    const late: PlanSetupState = {
      ...FORM_SHOWN,
      phase: "generating",
      step: "personalizing",
    };
    expect(planSetupReducer(late, { type: "paced", index: 1 })).toBe(late);
  });

  it("starts a retry afresh, and shows the form again on a reset", () => {
    const failed = planSetupReducer(
      planSetupReducer(FORM_SHOWN, { type: "started" }),
      { type: "failed", error: "busy" },
    );
    expect(failed.error).toBe("busy");
    expect(planSetupReducer(failed, { type: "started" }).error).toBeNull();
    expect(planSetupReducer(failed, { type: "reset" })).toBe(FORM_SHOWN);
  });

  it("goes from the form straight to a kept plan, with no timeline", () => {
    expect(planSetupReducer(FORM_SHOWN, { type: "kept" })).toEqual({
      ...FORM_SHOWN,
      phase: "kept",
    });
  });
});

describe("planRequest", () => {
  it("names the chosen subjects and the level as the server reads it", () => {
    const request = planRequest(
      {
        country: "NG",
        language: "en",
        system: "",
        level: "undergraduate",
        school: null,
        course: " Law ",
        selectedSubjects: ["tort", "gone"],
      },
      [{ id: "tort", label: "Law of Tort", recommended: true }],
    );
    expect(request).toEqual({
      country: "NG",
      language: "en",
      gradeLevel: "Undergraduate student, studying Law",
      subjects: ["Law of Tort"],
    });
  });
});
