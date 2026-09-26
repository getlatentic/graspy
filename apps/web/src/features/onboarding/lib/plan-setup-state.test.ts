import { describe, expect, it } from "vitest";
import {
  FORM_SHOWN,
  planRequest,
  planSetupReducer,
  type PlanSetupState,
} from "./plan-setup-state";

const stats = { subjectCount: 2, topicCount: 9 };

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
