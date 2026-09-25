import { describe, expect, it } from "vitest";
import type { SchoolSystem } from "./education-api";
import {
  afterSchoolDescriptor,
  COURSE_MAX,
  levelComplete,
  levelLabel,
  ON_MY_OWN,
  schoolDescriptor,
  type LearnerLevel,
} from "./learner-level";

const NIGERIA: SchoolSystem = {
  id: "NG",
  country: "NG",
  name: { en: "Nigeria" },
  main: true,
  stages: [{ id: "jss", name: { en: "Junior Secondary School" } }],
  levels: [
    {
      id: "jss-1",
      stage: "jss",
      year: 7,
      name: { en: "JSS 1", local: { yo: "JSS Kínní" } },
      aliases: ["JS1"],
      age: 12,
    },
  ],
};
const JSS_1 = NIGERIA.levels[0];

const learner = (
  change: Partial<LearnerLevel & { language: string; gradeLevel: string }>,
) => ({
  system: "",
  level: "",
  levelNames: null,
  course: "",
  language: "en",
  gradeLevel: "",
  ...change,
});

const t = (key: string) => key;

describe("the learner's level", () => {
  it("describes a class to the server with its stage, country and age", () => {
    expect(schoolDescriptor(NIGERIA, JSS_1)).toBe(
      "JSS 1 (Junior Secondary School), Nigeria, age 12",
    );
  });

  it("leaves the stage out when the description would be too long", () => {
    const long = {
      ...NIGERIA,
      stages: [{ id: "jss", name: { en: "S".repeat(90) } }],
    };

    expect(schoolDescriptor(long, JSS_1)).toBe("JSS 1, Nigeria, age 12");
  });

  it("describes a level after school with its course, within the limit", () => {
    expect(afterSchoolDescriptor("graduate", " Law ")).toBe(
      "Graduate student, studying Law",
    );
    expect(
      afterSchoolDescriptor("undergraduate", "x".repeat(COURSE_MAX)).length,
    ).toBeLessThanOrEqual(100);
  });

  it.each([
    [learner({ system: "NG", level: "jss-1", levelNames: JSS_1.name }), true],
    [learner({ system: "NG", level: "jss-1" }), false],
    [learner({ level: "undergraduate", course: "Law" }), true],
    [learner({ level: "graduate", course: "  " }), false],
    [learner({ level: ON_MY_OWN }), false],
    [learner({}), false],
  ])("knows when a level is answered: %o", (value, complete) => {
    expect(levelComplete(value)).toBe(complete);
  });

  it("names a class in the learner's language, or in English", () => {
    const chosen = { system: "NG", level: "jss-1", levelNames: JSS_1.name };

    expect(levelLabel(learner({ ...chosen, language: "yo" }), t)).toBe(
      "JSS Kínní",
    );
    expect(levelLabel(learner({ ...chosen, language: "ar" }), t)).toBe("JSS 1");
  });

  it("names the levels without a class", () => {
    expect(levelLabel(learner({ level: "graduate", course: "Law" }), t)).toBe(
      "level.graduate",
    );
    expect(levelLabel(learner({ level: ON_MY_OWN }), t)).toBe("you.onMyOwn");
    expect(levelLabel(learner({ gradeLevel: "JSS 1" }), t)).toBe("JSS 1");
  });
});
