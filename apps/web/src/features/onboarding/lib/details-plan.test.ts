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
type Signed = {
  uid: string;
  learner: { id: string; name: string } | null;
  deviceJoins: boolean;
};
const ADA: Signed = {
  uid: "uid-1",
  learner: { id: "ada", name: "Ada" },
  deviceJoins: false,
};
let signedIn: Signed | null = null;
let turn = 0;
/** The device learns as someone else, as a switch or a sign-out makes it. */
function learnAs(account: Signed | null): void {
  signedIn = account;
  turn += 1;
}

async function device() {
  vi.resetModules();
  vi.doMock("@/lib/shared-plan-api", () => server);
  vi.doMock("@/lib/plan-level", () => ({
    withRecoveredLevel: async (plan: CurriculumData) => plan,
  }));
  vi.doMock("@/lib/account/account-store", async (original) => ({
    ...(await original<typeof import("@/lib/account/account-store")>()),
    currentAccount: () => signedIn,
    learnerTurn: () => turn,
  }));
  return {
    db: await import("@/lib/curriculum-db"),
    profile: await import("@/lib/user-storage"),
    sync: await import("@/lib/plan-sync"),
    ...(await import("./details-plan")),
  };
}

/** The account's plan, for the class the learner was in before. */
function accountPlan(updatedAt = 2): CurriculumData {
  return {
    id: "current",
    planId: "plan-old",
    country: "Nigeria",
    language: "English",
    gradeLevel: primary.gradeLevel,
    subjects: [mathematics],
    topics: { mathematics: ["Counting"] },
    createdAt: 1,
    updatedAt,
  };
}

/** A request the test answers when it chooses. */
function answeredLater<T>() {
  let answer!: (value: T) => void;
  const answered = new Promise<T>((resolve) => (answer = resolve));
  return { answered, answer };
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

beforeEach(() => {
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  signedIn = null;
});

describe("keepDetails", () => {
  it("keeps a plan of its own for a learner moving into early years with none saved", async () => {
    const { db, keepDetails } = await device();

    const plan = await keepDetails(nursery, true);

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
    const { db, keepDetails } = await device();
    const saved = await db.saveCurriculum({
      country: "Nigeria",
      language: "English",
      gradeLevel: primary.gradeLevel,
      subjects: [mathematics],
      topics: { mathematics: ["Counting"] },
    });

    const plan = await keepDetails(nursery, true);

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
    const { db, keepDetails } = await device();

    expect(await keepDetails(primary, false)).toBeNull();
    expect(await db.getCurriculum()).toBeNull();
  });

  it("has a signed-in device with none saved take the account's plan, not replace it", async () => {
    signedIn = ADA;
    const { keepDetails, profile } = await device();
    server.accountPlan.mockResolvedValue(accountPlan());

    const plan = await keepDetails(nursery, true);

    expect(plan).toMatchObject({
      planId: "plan-old",
      subjects: [mathematics],
      level: "nursery-1",
    });
    expect(profile.getUserProfile()?.level).toBe("nursery-1");
  });

  it("keeps no plan for a signed-in device that cannot reach the account", async () => {
    signedIn = ADA;
    const { db, keepDetails } = await device();
    server.accountPlan.mockRejectedValue(new Error("offline"));

    expect(await keepDetails(nursery, true)).toBeNull();
    expect(await db.getCurriculum()).toBeNull();
  });

  it("keeps a plan of its own for a signed-in learner whose account has none", async () => {
    signedIn = ADA;
    const { db, keepDetails } = await device();
    server.accountPlan.mockResolvedValue(null);

    const plan = await keepDetails(nursery, true);

    expect(plan).toMatchObject({ level: "nursery-1", subjects: [] });
    expect(await db.getCurriculum()).toEqual(plan);
  });

  it("keeps no plan when the account does not answer in time", async () => {
    signedIn = ADA;
    const { db, keepDetails, profile } = await device();
    server.accountPlan.mockReturnValue(new Promise(() => {}));
    const waited: number[] = [];

    const kept = await keepDetails(nursery, true, async (ms) => {
      waited.push(ms);
    });

    expect(kept).toBeNull();
    expect(waited).toEqual([8_000]);
    expect(await db.getCurriculum()).toBeNull();
    expect(profile.getUserProfile()?.level).toBe("nursery-1");
  });

  it("keeps no plan for an account with no learner chosen", async () => {
    signedIn = { ...ADA, learner: null, deviceJoins: true };
    const { db, keepDetails } = await device();

    expect(await keepDetails(nursery, true)).toBeNull();
    expect(await db.getCurriculum()).toBeNull();
    expect(server.accountPlan).not.toHaveBeenCalled();
  });
});

describe("keepDetails when the account answers after the wait", () => {
  const noWait = async () => undefined;

  it("has the plan the account answers with take the new details, and sends them next", async () => {
    signedIn = ADA;
    const { db, keepDetails, profile, sync } = await device();
    const late = answeredLater<CurriculumData>();
    server.accountPlan.mockReturnValue(late.answered);
    server.sendPlan.mockImplementation(async (plan) => plan);

    expect(await keepDetails(nursery, true, noWait)).toBeNull();
    late.answer(accountPlan());
    await sync.syncPlan();

    expect(profile.getUserProfile()).toMatchObject({
      level: "nursery-1",
      gradeLevel: nursery.gradeLevel,
    });
    expect(await db.getCurriculum()).toMatchObject({
      planId: "plan-old",
      subjects: [mathematics],
      level: "nursery-1",
      gradeLevel: nursery.gradeLevel,
    });
    expect(server.sendPlan).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan-old", level: "nursery-1" }),
      expect.any(Function),
    );
  });

  it("leaves a plan the account holds that is newer than the details as it is", async () => {
    signedIn = ADA;
    const { db, keepDetails, sync } = await device();
    const late = answeredLater<CurriculumData>();
    server.accountPlan.mockReturnValue(late.answered);

    await keepDetails(nursery, true, noWait);
    late.answer(accountPlan(Date.now() + 60_000));
    await sync.syncPlan();

    expect(await db.getCurriculum()).toMatchObject({
      gradeLevel: primary.gradeLevel,
    });
    expect(server.sendPlan).not.toHaveBeenCalled();
  });

  it("gives the details to no other learner whose plan the device takes", async () => {
    signedIn = ADA;
    const { db, keepDetails, sync } = await device();
    server.accountPlan.mockReturnValue(new Promise(() => {}));
    await keepDetails(nursery, true, noWait);

    learnAs({ ...ADA, learner: { id: "grace", name: "Grace" } });
    server.accountPlan.mockResolvedValue(accountPlan());
    await sync.syncPlan();

    expect(await db.getCurriculum()).toMatchObject({
      gradeLevel: primary.gradeLevel,
    });
  });
});

describe("keepDetails once the device learns as someone else during the wait", () => {
  it("writes none of the details onto the device, which now holds the next learner", async () => {
    signedIn = ADA;
    const { keepDetails, profile } = await device();
    server.accountPlan.mockReturnValue(new Promise(() => {}));

    await expect(
      keepDetails(nursery, true, async () => learnAs(null)),
    ).rejects.toMatchObject({ name: "LearnerChanged" });

    expect(profile.getUserProfile()).toBeNull();
  });
});
