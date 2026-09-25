import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/lib/user-storage";
import type { DetailsSchema } from "../schemas/onboarding-schema";
import {
  detailsChanged,
  detailsComplete,
  detailsOf,
  learnerDetails,
} from "./details";

const JSS_1 = { en: "JSS 1", local: { yo: "JSS Kínní" } };

const school: DetailsSchema = {
  country: "NG",
  language: "yo",
  system: "NG",
  level: "jss-1",
  school: {
    names: JSS_1,
    descriptor: "JSS 1 (Junior Secondary School), Nigeria, age 12",
  },
  course: "left from before",
};

const profile = (details: DetailsSchema): UserProfile => ({
  id: "u",
  ...learnerDetails(details),
  preferredSubjects: [],
  createdAt: "",
  updatedAt: "",
  onboardingCompleted: true,
});

describe("the learner's details", () => {
  it("keep a school class with its names and the level the server reads", () => {
    expect(learnerDetails(school)).toEqual({
      country: "NG",
      language: "yo",
      system: "NG",
      level: "jss-1",
      levelNames: JSS_1,
      course: "",
      gradeLevel: "JSS 1 (Junior Secondary School), Nigeria, age 12",
    });
  });

  it("keep a level after school with its course", () => {
    const graduate = { ...school, level: "graduate", course: " Law " };

    expect(learnerDetails(graduate)).toMatchObject({
      system: "",
      levelNames: null,
      course: "Law",
      gradeLevel: "Graduate student, studying Law",
    });
  });

  it("are complete only with a class, or a course after school", () => {
    expect(detailsComplete(school)).toBe(true);
    expect(detailsComplete({ ...school, school: null })).toBe(false);
    expect(detailsComplete({ ...school, level: "graduate", course: "" })).toBe(
      false,
    );
    expect(detailsComplete({ ...school, country: "" })).toBe(false);
  });

  it("fill the form as they were saved, and see no change in them", () => {
    const saved = profile(school);
    const form = detailsOf(saved);

    expect(form.school?.names).toEqual(JSS_1);
    expect(detailsChanged(saved, form)).toBe(false);
    expect(detailsChanged(saved, { ...form, language: "en" })).toBe(true);
  });

  it("ask for a class again when a saved one is not from the catalogue", () => {
    const earlier = { ...profile(school), level: "", levelNames: null };

    expect(detailsOf(earlier)).toMatchObject({ level: "", school: null });
  });
});
