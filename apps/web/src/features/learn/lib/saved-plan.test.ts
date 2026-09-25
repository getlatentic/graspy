import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const saved = { planId: "plan-1", subjects: [] } as unknown as CurriculumData;
const accountsPlan = {
  planId: "plan-account",
  subjects: [],
} as unknown as CurriculumData;

let onDevice: CurriculumData | null = saved;
vi.mock("@/lib/curriculum-db", () => ({ getCurriculum: async () => onDevice }));
const changePlanRecord = vi.fn(() => new Promise(() => {}));
vi.mock("@/lib/learner-record", () => ({ changePlanRecord }));
let signedIn: { uid: string } | null = null;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
}));
const syncPlan = vi.fn(async () => accountsPlan);
vi.mock("@/lib/plan-sync", () => ({ syncPlan }));

const { loadSavedPlan } = await import("./saved-plan");

beforeEach(() => {
  onDevice = saved;
  signedIn = null;
  vi.clearAllMocks();
});

describe("loadSavedPlan", () => {
  it("opens the saved plan without waiting for the server", async () => {
    await expect(loadSavedPlan()).resolves.toBe(saved);
    expect(changePlanRecord).toHaveBeenCalledWith({
      kind: "plan_kept",
      planId: "plan-1",
    });
  });

  it("keeps a signed-in learner's shared record, which a newer plan may own", async () => {
    signedIn = { uid: "uid-1" };

    await expect(loadSavedPlan()).resolves.toBe(saved);

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
