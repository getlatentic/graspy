import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "./curriculum-record";
import type { SchoolSystem } from "./education-api";

const schoolSystems = vi.fn<(country: string) => Promise<SchoolSystem[]>>();
vi.mock("./education-api", () => ({ schoolSystems }));

const { withRecoveredLevel } = await import("./plan-level");
const { learnerDetailsOf } = await import("./plan-details");

const JSS_3 = { en: "JSS 3", local: { yo: "JSS Kẹta" } };
const NIGERIA: SchoolSystem = {
  id: "NG",
  country: "NG",
  name: { en: "Nigeria" },
  main: true,
  stages: [{ id: "jss", name: { en: "Junior Secondary School" } }],
  levels: [
    { id: "jss-3", stage: "jss", year: 9, name: JSS_3, aliases: [], age: 14 },
  ],
};
const JSS_3_GRADE = "JSS 3 (Junior Secondary School), Nigeria, age 14";

function earlierPlan(gradeLevel: string): CurriculumData {
  return {
    id: "current",
    planId: "plan-1",
    country: "Nigeria",
    language: "English",
    gradeLevel,
    subjects: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

/** What adopt() saves to the profile of a device whose class is `deviceGrade`. */
async function adopted(gradeLevel: string, deviceGrade: string) {
  return learnerDetailsOf(
    await withRecoveredLevel(earlierPlan(gradeLevel)),
    deviceGrade,
  );
}

beforeEach(() => {
  schoolSystems.mockReset().mockResolvedValue([NIGERIA]);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("withRecoveredLevel", () => {
  it("reads a course after school back from the plan's class", async () => {
    const details = await adopted(
      "Graduate student, studying Public Health",
      "JSS 1",
    );

    expect(details).toMatchObject({
      system: "",
      level: "graduate",
      levelNames: null,
      course: "Public Health",
    });
    expect(schoolSystems).not.toHaveBeenCalled();
  });

  it("finds the country's class the plan was written for", async () => {
    const details = await adopted(JSS_3_GRADE, "JSS 1");

    expect(schoolSystems).toHaveBeenCalledWith("NG");
    expect(details).toMatchObject({
      country: "NG",
      gradeLevel: JSS_3_GRADE,
      system: "NG",
      level: "jss-3",
      levelNames: JSS_3,
      course: "",
    });
  });

  it("keeps the device's level when no class matches and the plan is for its class", async () => {
    expect(await adopted("JSS 1", "JSS 1")).toStrictEqual({
      country: "NG",
      language: "en",
      gradeLevel: "JSS 1",
    });
  });

  it("clears the device's level when no class matches and the plan is for another class", async () => {
    expect(await adopted("JSS 9", "JSS 1")).toMatchObject({
      gradeLevel: "JSS 9",
      system: "",
      level: "",
      levelNames: null,
      course: "",
    });
  });

  it("falls back to the device's level when the catalogue cannot be reached", async () => {
    schoolSystems.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await adopted(JSS_3_GRADE, "JSS 1")).toMatchObject({
      gradeLevel: JSS_3_GRADE,
      level: "",
      levelNames: null,
    });
  });

  it("leaves a plan with level fields as it is", async () => {
    const plan = { ...earlierPlan(JSS_3_GRADE), level: "jss-3" };

    expect(await withRecoveredLevel(plan)).toBe(plan);
    expect(schoolSystems).not.toHaveBeenCalled();
  });
});
