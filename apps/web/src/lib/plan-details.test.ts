import { describe, expect, it } from "vitest";
import type { CurriculumData } from "./curriculum-record";
import {
  completedPlan,
  learnerDetailsOf,
  planDetails,
  writtenFor,
} from "./plan-details";
import type { LearnerDetails } from "./user-storage";

const JSS_2 = "JSS 2 (Junior Secondary School), Nigeria, age 13";

const learner: LearnerDetails = {
  country: "NG",
  language: "yo",
  system: "NG",
  level: "jss-2",
  levelNames: { en: "JSS 2", local: { yo: "JSS Kejì" } },
  course: "",
  gradeLevel: JSS_2,
};

function plan(details: Partial<CurriculumData>): CurriculumData {
  return {
    id: "current",
    planId: "plan-1",
    country: "",
    language: "",
    gradeLevel: "",
    subjects: [],
    createdAt: 1,
    updatedAt: 1,
    ...details,
  };
}

describe("planDetails", () => {
  it("names the country and language in English and keeps the learner's details", () => {
    expect(planDetails(learner)).toEqual({
      country: "Nigeria",
      countryName: "Nigeria",
      countryCode: "NG",
      language: "Yoruba",
      languageName: "Yoruba",
      languageCode: "yo",
      gradeLevel: JSS_2,
      system: "NG",
      level: "jss-2",
      levelNames: learner.levelNames,
      course: "",
    });
  });

  it("keeps a course after school", () => {
    const student: LearnerDetails = {
      ...learner,
      system: "",
      level: "undergraduate",
      levelNames: null,
      course: "Accounting",
      gradeLevel: "Undergraduate student, studying Accounting",
    };

    expect(planDetails(student)).toMatchObject({
      system: "",
      level: "undergraduate",
      levelNames: null,
      course: "Accounting",
    });
  });
});

describe("learnerDetailsOf", () => {
  it("gives back the details the plan was written for", () => {
    const adopted = learnerDetailsOf(plan(planDetails(learner)), "JSS 1");

    expect(adopted).toStrictEqual({ ...learner, earlierYear: undefined });
  });

  it("reads an earlier plan for the device's class by English names, keeping the device's level", () => {
    const earlier = plan({
      country: "Nigeria",
      language: "English",
      gradeLevel: "JSS 1",
    });

    expect(learnerDetailsOf(earlier, "JSS 1")).toEqual({
      country: "NG",
      language: "en",
      gradeLevel: "JSS 1",
    });
  });

  it("clears the device's level for an earlier plan for another class", () => {
    const earlier = plan({
      country: "Nigeria",
      language: "English",
      gradeLevel: "JSS 3",
    });

    expect(learnerDetailsOf(earlier, "JSS 1")).toStrictEqual({
      country: "NG",
      language: "en",
      gradeLevel: "JSS 3",
      system: "",
      level: "",
      levelNames: null,
      course: "",
      earlierYear: undefined,
    });
  });

  it("reads an earlier plan that kept codes", () => {
    const earlier = plan({ country: "GH", language: "fr", gradeLevel: "B7" });

    expect(learnerDetailsOf(earlier, "B7")).toEqual({
      country: "GH",
      language: "fr",
      gradeLevel: "B7",
    });
  });

  it("leaves out a country or language it cannot place", () => {
    const earlier = plan({
      country: "Atlantis",
      language: "Atlantean",
      gradeLevel: "Year 1",
    });

    expect(learnerDetailsOf(earlier, "Year 1")).toEqual({
      gradeLevel: "Year 1",
    });
  });
});

describe("writtenFor", () => {
  it("holds for the plan the learner's details made", () => {
    expect(writtenFor(plan(planDetails(learner)), learner)).toBe(true);
  });

  it("holds for an earlier plan naming the same place and class", () => {
    const earlier = plan({
      country: "NG",
      language: "Yoruba",
      gradeLevel: JSS_2,
    });

    expect(writtenFor(earlier, learner)).toBe(true);
  });

  it("fails for a plan written for another class", () => {
    const other = plan({ ...planDetails(learner), gradeLevel: "JSS 3" });

    expect(writtenFor(other, learner)).toBe(false);
  });

  it("fails for a plan written in another language", () => {
    const other = plan({
      ...planDetails(learner),
      languageCode: "en",
      language: "English",
    });

    expect(writtenFor(other, learner)).toBe(false);
  });

  it("does not hold a country or language it cannot place against the learner", () => {
    const earlier = plan({
      country: "Atlantis",
      language: "Atlantean",
      gradeLevel: JSS_2,
    });

    expect(writtenFor(earlier, learner)).toBe(true);
  });
});

describe("completedPlan", () => {
  it("names a rebuilt plan's place in English, keeping the codes", () => {
    const rebuilt = plan({ country: "NG", language: "yo", gradeLevel: JSS_2 });

    expect(completedPlan(rebuilt, null)).toMatchObject({
      country: "Nigeria",
      countryName: "Nigeria",
      countryCode: "NG",
      language: "Yoruba",
      languageName: "Yoruba",
      languageCode: "yo",
    });
  });

  it("gives an earlier plan the level of the learner it was written for", () => {
    const earlier = plan({
      country: "Nigeria",
      language: "Yoruba",
      gradeLevel: JSS_2,
    });

    expect(completedPlan(earlier, learner)).toMatchObject({
      system: "NG",
      level: "jss-2",
      levelNames: learner.levelNames,
      course: "",
    });
  });

  it("does not give an earlier plan for another class the learner's level", () => {
    const other = plan({
      country: "Nigeria",
      language: "Yoruba",
      gradeLevel: "JSS 3",
    });

    expect(completedPlan(other, learner).level).toBeUndefined();
  });

  it("keeps a plan's own level and its date", () => {
    const own = plan({ ...planDetails(learner), level: "jss-1", updatedAt: 7 });

    expect(completedPlan(own, learner)).toStrictEqual(own);
  });

  it("leaves what it cannot place", () => {
    const earlier = plan({ country: "Atlantis", language: "Atlantean" });

    expect(completedPlan(earlier, null)).toStrictEqual(earlier);
  });
});
