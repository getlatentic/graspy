import { describe, expect, it } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";
import type { UserProfile } from "@/lib/user-storage";
import { planWanted } from "./curriculum-request";

const profile = (level: string): UserProfile => ({
  id: "u",
  country: "NG",
  language: "en",
  gradeLevel: "",
  system: "NG",
  level,
  levelNames: null,
  course: "",
  preferredSubjects: [],
  createdAt: "",
  updatedAt: "",
  onboardingCompleted: true,
});

const plan = (
  level: string | undefined,
  subjects: CurriculumData["subjects"],
): CurriculumData => ({
  id: "current",
  planId: "plan-1",
  country: "Nigeria",
  language: "English",
  gradeLevel: "",
  system: level ? "NG" : undefined,
  level,
  subjects,
  createdAt: 1,
  updatedAt: 1,
});

const MATHS = [{ name: "Mathematics", slug: "mathematics" }];

describe("planWanted", () => {
  it("makes a plan for a class that learns from slides and has no subjects", () => {
    expect(planWanted(null, profile("primary-1"))).toBe(true);
    expect(planWanted(plan("primary-1", []), profile("primary-1"))).toBe(true);
  });

  it("makes none once there are subjects", () => {
    expect(planWanted(plan("primary-1", MATHS), profile("primary-1"))).toBe(
      false,
    );
  });

  it("makes none for a class that learns by voice alone", () => {
    expect(planWanted(null, profile("nursery-1"))).toBe(false);
    expect(planWanted(plan("kindergarten", []), profile("kindergarten"))).toBe(
      false,
    );
  });

  it("goes by the plan's class over the device's", () => {
    expect(planWanted(plan("nursery-2", []), profile("primary-3"))).toBe(false);
    expect(planWanted(plan("primary-3", []), profile("nursery-2"))).toBe(true);
    expect(planWanted(plan(undefined, []), profile("nursery-2"))).toBe(false);
  });
});
