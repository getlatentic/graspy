import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";
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

const server = {
  accountPlan: vi.fn<() => Promise<CurriculumData | null>>(),
  sendPlan: vi.fn<(plan: CurriculumData) => Promise<CurriculumData>>(),
  joinPlan: vi.fn<(plan: CurriculumData) => Promise<CurriculumData>>(),
};
let signedIn: { uid: string; learner: { id: string } } | null = null;

async function device() {
  vi.resetModules();
  vi.doMock("@/lib/shared-plan-api", () => server);
  vi.doMock("@/lib/follow-plan", () => ({ followPlan: async () => {} }));
  vi.doMock("@/lib/account/account-store", () => ({
    currentAccount: () => signedIn,
    learnerKeyOf: (account: { uid: string; learner: { id: string } }) =>
      `${account.uid}/${account.learner.id}`,
  }));
  return {
    db: await import("@/lib/curriculum-db"),
    ...(await import("./details-plan")),
  };
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  signedIn = null;
});

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

  it("has a signed-in device with none saved take the account's plan, not replace it", async () => {
    signedIn = { uid: "uid-1", learner: { id: "ada" } };
    const { keptPlan } = await device();
    const account: CurriculumData = {
      id: "current",
      planId: "plan-old",
      country: "Nigeria",
      language: "English",
      gradeLevel: primary.gradeLevel,
      subjects: [mathematics],
      topics: { mathematics: ["Counting"] },
      createdAt: 1,
      updatedAt: 2,
    };
    server.accountPlan.mockResolvedValue(account);

    const plan = await keptPlan(nursery, true);

    expect(plan).toMatchObject({
      planId: "plan-old",
      subjects: [mathematics],
      level: "nursery-1",
    });
  });

  it("keeps no plan for a signed-in device that cannot reach the account", async () => {
    signedIn = { uid: "uid-1", learner: { id: "ada" } };
    const { db, keptPlan } = await device();
    server.accountPlan.mockRejectedValue(new Error("offline"));

    expect(await keptPlan(nursery, true)).toBeNull();
    expect(await db.getCurriculum()).toBeNull();
  });

  it("keeps a plan of its own for a signed-in learner whose account has none", async () => {
    signedIn = { uid: "uid-1", learner: { id: "ada" } };
    const { db, keptPlan } = await device();
    server.accountPlan.mockResolvedValue(null);

    const plan = await keptPlan(nursery, true);

    expect(plan).toMatchObject({ level: "nursery-1", subjects: [] });
    expect(await db.getCurriculum()).toEqual(plan);
  });
});
