import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const saved = { planId: "plan-1", subjects: [] } as unknown as CurriculumData;
const accountsPlan = {
  planId: "plan-account",
  subjects: [],
} as unknown as CurriculumData;

let onDevice: CurriculumData | null = saved;
const holdCurriculum = vi.fn(async (plan: CurriculumData) => {
  onDevice = plan;
});
vi.mock("@/lib/curriculum-db", () => ({
  getCurriculum: async () => onDevice,
  holdCurriculum,
}));
vi.mock("@/lib/user-storage", () => ({
  getUserProfile: () => ({
    country: "NG",
    language: "en",
    gradeLevel: "JSS 1",
  }),
}));
const changePlanRecord = vi.fn(() => new Promise(() => {}));
vi.mock("@/lib/learner-record", () => ({ changePlanRecord }));
let signedIn: { uid: string } | null = null;
let turn = 0;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  holderOf: () => "device",
  learnerTurn: () => turn,
}));
const syncPlan = vi.fn(async () => accountsPlan);
vi.mock("@/lib/plan-sync", () => ({ syncPlan }));
const followPlan = vi.fn(async () => {});
vi.mock("@/lib/follow-plan", () => ({ followPlan }));

const { loadSavedPlan } = await import("./saved-plan");

beforeEach(() => {
  onDevice = saved;
  signedIn = null;
  vi.clearAllMocks();
});

describe("loadSavedPlan", () => {
  it("keeps an earlier plan completed, with its date", async () => {
    onDevice = {
      ...saved,
      country: "NG",
      language: "en",
      gradeLevel: "JSS 1",
      updatedAt: 5,
    };

    const loaded = await loadSavedPlan();

    expect(loaded).toMatchObject({
      country: "Nigeria",
      countryCode: "NG",
      updatedAt: 5,
    });
    expect(holdCurriculum).toHaveBeenCalledWith(loaded);
    expect(followPlan).toHaveBeenCalledWith(loaded, expect.anything());
  });

  it("takes the plan's details only while the device learns as the learner it loaded for", async () => {
    await loadSavedPlan();
    const [[, pin]] = followPlan.mock.calls as unknown as [
      [CurriculumData, { hold: () => void }],
    ];

    expect(() => pin.hold()).not.toThrow();
    turn += 1;
    expect(() => pin.hold()).toThrow("no longer the one");
  });

  it("opens the saved plan without waiting for the server", async () => {
    await expect(loadSavedPlan()).resolves.toEqual(saved);
    expect(followPlan).toHaveBeenCalledWith(saved, expect.anything());
    expect(changePlanRecord).toHaveBeenCalledWith({
      kind: "plan_kept",
      planId: "plan-1",
    });
  });

  it("keeps a signed-in learner's shared record, which a newer plan may own", async () => {
    signedIn = { uid: "uid-1" };

    await expect(loadSavedPlan()).resolves.toEqual(saved);

    expect(changePlanRecord).not.toHaveBeenCalled();
    expect(syncPlan).not.toHaveBeenCalled();
  });

  it("takes the account's plan on a signed-in device that has none", async () => {
    signedIn = { uid: "uid-1" };
    onDevice = null;

    await expect(loadSavedPlan()).resolves.toBe(accountsPlan);
  });

  it("opens with no plan when the account cannot be reached", async () => {
    signedIn = { uid: "uid-1" };
    onDevice = null;
    syncPlan.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(loadSavedPlan()).resolves.toBeNull();
  });
});
