import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerDetails } from "@/lib/user-storage";

const nursery: LearnerDetails = {
  country: "NG",
  language: "en",
  system: "NG",
  level: "nursery-1",
  levelNames: { en: "Nursery 1" },
  course: "",
  gradeLevel: "Nursery 1 (Early childhood), Nigeria, age 3",
};

const primary: LearnerDetails = {
  ...nursery,
  level: "primary-2",
  levelNames: { en: "Primary 2" },
  gradeLevel: "Primary 2, Nigeria",
};

const mathematics = {
  name: "Mathematics",
  slug: "mathematics",
};

async function device() {
  vi.resetModules();
  return {
    db: await import("@/lib/curriculum-db"),
    ...(await import("./details-plan")),
  };
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});

afterEach(() => vi.unstubAllGlobals());

describe("keptPlan", () => {
  it("keeps a plan of its own for a learner moving into early years with none saved", async () => {
    const { db, keptPlan } = await device();

    const plan = await keptPlan(nursery, true);

    expect(plan).toMatchObject({
      countryCode: "NG",
      level: "nursery-1",
      gradeLevel: nursery.gradeLevel,
      subjects: [],
      topics: {},
    });
    expect(await db.getCurriculum()).toEqual(plan);
  });

  it("has the saved plan, subjects and all, take the new details", async () => {
    const { db, keptPlan } = await device();
    const saved = await db.saveCurriculum({
      country: "Nigeria",
      language: "English",
      gradeLevel: primary.gradeLevel,
      subjects: [mathematics],
      topics: { mathematics: ["Counting"] },
    });

    const plan = await keptPlan(nursery, true);

    expect(plan).toEqual({
      ...saved,
      countryName: "Nigeria",
      countryCode: "NG",
      languageName: "English",
      languageCode: "en",
      gradeLevel: nursery.gradeLevel,
      system: "NG",
      level: "nursery-1",
      levelNames: { en: "Nursery 1" },
      course: "",
    });
  });

  it("keeps no plan for any other class with none saved", async () => {
    const { db, keptPlan } = await device();

    expect(await keptPlan(primary, false)).toBeNull();
    expect(await db.getCurriculum()).toBeNull();
  });
});
