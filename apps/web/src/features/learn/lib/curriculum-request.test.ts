import { describe, expect, it } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";
import { planWanted } from "./curriculum-request";

const plan = (subjects: CurriculumData["subjects"]): CurriculumData => ({
  id: "current",
  planId: "plan-1",
  country: "Nigeria",
  language: "English",
  gradeLevel: "",
  subjects,
  createdAt: 1,
  updatedAt: 1,
});

const MATHS = [{ name: "Mathematics", slug: "mathematics" }];

describe("planWanted", () => {
  it("makes a plan once the server says the class learns by slides and voice", () => {
    expect(planWanted(null, false)).toBe(true);
    expect(planWanted(plan([]), false)).toBe(true);
  });

  it("makes none once there are subjects", () => {
    expect(planWanted(plan(MATHS), false)).toBe(false);
  });

  it("makes none for a class the server says learns by voice alone", () => {
    expect(planWanted(plan([]), true)).toBe(false);
  });

  it("makes none before the server has said: it could replace a voice-only plan", () => {
    expect(planWanted(plan([]), null)).toBe(false);
    expect(planWanted(null, null)).toBe(false);
  });
});
