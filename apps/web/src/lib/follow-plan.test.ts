import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "./curriculum-record";
import type { UserProfile } from "./user-storage";

const GRADE_3 = "Grade 3 (Basic school (Základná škola)), Slovakia, age 8";
const GRADE_8 = "Grade 8 (Basic school (Základná škola)), Slovakia, age 13";

let profile: Partial<UserProfile> | null;
const saveUserProfile = vi.fn();
vi.mock("./user-storage", () => ({
  getUserProfile: () => profile,
  saveUserProfile,
}));

const GRADE_8_LEVEL = {
  system: "SK",
  level: "grade-8",
  levelNames: { en: "Grade 8", local: { sk: "8. ročník" } },
  course: "",
};
const withRecoveredLevel = vi.fn(
  async (plan: CurriculumData): Promise<CurriculumData> => ({
    ...plan,
    ...GRADE_8_LEVEL,
  }),
);
vi.mock("./plan-level", () => ({ withRecoveredLevel }));

const { followPlan } = await import("./follow-plan");

const plan = (gradeLevel: string): CurriculumData => ({
  id: "current",
  planId: "plan-1",
  country: "Slovakia",
  language: "English",
  gradeLevel,
  subjects: [],
  createdAt: 1,
  updatedAt: 2,
});

beforeEach(() => {
  profile = {
    country: "SK",
    language: "en",
    system: "SK",
    level: "grade-3",
    levelNames: { en: "Grade 3", local: { sk: "3. ročník" } },
    course: "",
    gradeLevel: GRADE_3,
  };
  vi.clearAllMocks();
});

describe("followPlan", () => {
  it("leaves the details of the class the plan was written for", async () => {
    await followPlan(plan(GRADE_3));

    expect(withRecoveredLevel).not.toHaveBeenCalled();
    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it("takes the class of a plan written for another, with its level", async () => {
    await followPlan(plan(GRADE_8));

    expect(saveUserProfile).toHaveBeenCalledWith({
      country: "SK",
      language: "en",
      gradeLevel: GRADE_8,
      ...GRADE_8_LEVEL,
      earlierYear: undefined,
    });
  });

  it("finds the level a device could not find when it took the plan", async () => {
    profile = {
      ...profile,
      gradeLevel: GRADE_8,
      system: "",
      level: "",
      levelNames: null,
    };

    await followPlan(plan(GRADE_8));

    expect(saveUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ gradeLevel: GRADE_8, level: "grade-8" }),
    );
  });

  it("leaves the details when the catalogue has no level for the plan", async () => {
    profile = {
      ...profile,
      gradeLevel: GRADE_8,
      system: "",
      level: "",
      levelNames: null,
    };
    withRecoveredLevel.mockImplementationOnce(async (plan) => plan);

    await followPlan(plan(GRADE_8));

    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it("gives a device without details the plan's", async () => {
    profile = null;

    await followPlan(plan(GRADE_8));

    expect(saveUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ country: "SK", gradeLevel: GRADE_8 }),
    );
  });
});
