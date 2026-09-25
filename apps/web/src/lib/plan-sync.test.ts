import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const server = {
  accountPlan: vi.fn<() => Promise<CurriculumData | null>>(),
  sendPlan: vi.fn<(plan: CurriculumData) => Promise<CurriculumData>>(),
  joinPlan: vi.fn<(plan: CurriculumData) => Promise<CurriculumData>>(),
};
vi.mock("@/lib/shared-plan-api", () => server);

let device: CurriculumData | null = null;
const holdCurriculum = vi.fn(async (plan: CurriculumData) => {
  device = plan;
});
vi.mock("@/lib/curriculum-db", () => ({
  getCurriculum: async () => device,
  holdCurriculum,
}));

vi.mock("@/lib/plan-level", () => ({
  withRecoveredLevel: async (plan: CurriculumData) => plan,
}));

const saveUserProfile = vi.fn();
vi.mock("@/lib/user-storage", () => ({
  getUserProfile: () => ({ gradeLevel: "JSS 1" }),
  saveUserProfile,
}));

type Signed = { uid: string; learner: { id: string } | null };
const ADA: Signed = { uid: "uid-1", learner: { id: "ada" } };
let signedIn: Signed | null = ADA;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  learnerKeyOf: (account: Signed) =>
    account.learner ? `${account.uid}/${account.learner.id}` : null,
}));

const { forgetPlanSync, syncPlan } = await import("./plan-sync");

function plan(planId: string, updatedAt: number): CurriculumData {
  return {
    id: "current",
    planId,
    country: "Nigeria",
    language: "English",
    gradeLevel: "JSS 1",
    subjects: [{ name: "Mathematics", slug: "mathematics" }],
    createdAt: 1,
    updatedAt,
  };
}

const JSS_3 = "JSS 3 (Junior Secondary School), Nigeria, age 14";

/** A plan for another class, with the details it was written for. */
function forJss3(planId: string, updatedAt: number): CurriculumData {
  return {
    ...plan(planId, updatedAt),
    countryCode: "NG",
    languageCode: "en",
    gradeLevel: JSS_3,
    system: "NG",
    level: "jss-3",
    levelNames: { en: "JSS 3" },
    course: "",
  };
}

const JSS_3_LEARNER = {
  country: "NG",
  language: "en",
  gradeLevel: JSS_3,
  system: "NG",
  level: "jss-3",
  levelNames: { en: "JSS 3" },
  course: "",
};

const unreachable = () => Promise.reject(new TypeError("Failed to fetch"));

/** Signed in and joined, with the device's plan agreed with the account. */
async function joinedWith(agreed: CurriculumData): Promise<void> {
  device = agreed;
  server.joinPlan.mockResolvedValueOnce(agreed);
  await syncPlan();
  vi.clearAllMocks();
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  vi.resetAllMocks();
  device = null;
  signedIn = ADA;
});

describe("syncPlan without a learner", () => {
  it.each([
    ["signed out", null],
    ["signed in with no learner chosen", { uid: "uid-1", learner: null }],
  ])("does nothing %s", async (_, account) => {
    signedIn = account;
    device = plan("plan-1", 10);

    await expect(syncPlan()).resolves.toBeNull();

    expect(server.accountPlan).not.toHaveBeenCalled();
    expect(server.sendPlan).not.toHaveBeenCalled();
    expect(server.joinPlan).not.toHaveBeenCalled();
  });
});

describe("syncPlan for another learner of the account", () => {
  it("joins again, as the first sync for that learner", async () => {
    await joinedWith(plan("plan-ada", 10));
    signedIn = { uid: "uid-1", learner: { id: "grace" } };
    server.joinPlan.mockResolvedValue(plan("plan-ada", 10));

    await syncPlan();

    expect(server.joinPlan).toHaveBeenCalled();
  });
});

describe("syncPlan on signing in", () => {
  it("joins the device's plan and holds the merged plan the account returns", async () => {
    device = plan("plan-device", 10);
    const merged = plan("plan-account", 20);
    server.joinPlan.mockResolvedValue(merged);

    await expect(syncPlan()).resolves.toEqual(merged);

    expect(server.joinPlan).toHaveBeenCalledWith(
      expect.objectContaining(plan("plan-device", 10)),
    );
    expect(holdCurriculum).toHaveBeenCalledWith(merged);
    expect(device).toEqual(merged);
  });

  it("names the place of a plan that kept only codes for it, as the server compares", async () => {
    device = { ...plan("plan-device", 10), country: "NG", language: "en" };
    server.joinPlan.mockResolvedValue(plan("plan-account", 20));

    await syncPlan();

    expect(server.joinPlan).toHaveBeenCalledWith(
      expect.objectContaining({ country: "Nigeria", language: "English" }),
    );
  });

  it("keeps the device's plan when the account took it as it was", async () => {
    device = plan("plan-1", 10);
    server.joinPlan.mockResolvedValue(plan("plan-1", 10));

    await expect(syncPlan()).resolves.toBeNull();

    expect(holdCurriculum).not.toHaveBeenCalled();
  });

  it("holds the account's plan when the device has none", async () => {
    const account = plan("plan-account", 20);
    server.accountPlan.mockResolvedValue(account);

    await expect(syncPlan()).resolves.toEqual(account);

    expect(server.joinPlan).not.toHaveBeenCalled();
    expect(device).toEqual(account);
  });

  it("does nothing when neither has a plan", async () => {
    server.accountPlan.mockResolvedValue(null);

    await expect(syncPlan()).resolves.toBeNull();

    expect(holdCurriculum).not.toHaveBeenCalled();
  });

  it("joins once, and again after signing out", async () => {
    await joinedWith(plan("plan-1", 10));
    server.accountPlan.mockResolvedValue(plan("plan-1", 10));

    await syncPlan();
    expect(server.joinPlan).not.toHaveBeenCalled();

    forgetPlanSync();
    server.joinPlan.mockResolvedValue(plan("plan-1", 10));
    await syncPlan();
    expect(server.joinPlan).toHaveBeenCalledTimes(1);
  });

  it("joins again when an earlier join failed", async () => {
    device = plan("plan-1", 10);
    server.joinPlan.mockImplementationOnce(unreachable);
    await expect(syncPlan()).rejects.toThrow("Failed to fetch");

    server.joinPlan.mockResolvedValue(plan("plan-1", 10));
    await syncPlan();

    expect(server.joinPlan).toHaveBeenCalledTimes(2);
    expect(server.sendPlan).not.toHaveBeenCalled();
  });
});

describe("syncPlan after a save", () => {
  it("sends the saved plan", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    server.sendPlan.mockResolvedValue(plan("plan-1", 11));

    await expect(syncPlan()).resolves.toBeNull();

    expect(server.sendPlan).toHaveBeenCalledWith(plan("plan-1", 11));
    expect(server.accountPlan).not.toHaveBeenCalled();
    expect(holdCurriculum).not.toHaveBeenCalled();
  });

  it("holds the newer plan another device saved when the server answers a stale one with it", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    const newer = plan("plan-2", 15);
    server.sendPlan.mockResolvedValue(newer);

    await expect(syncPlan()).resolves.toEqual(newer);

    expect(device).toEqual(newer);
  });

  it("does not overwrite a save made while the server answered", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    server.sendPlan.mockImplementation(async () => {
      device = plan("plan-1", 12);
      return plan("plan-other", 11.5);
    });

    await expect(syncPlan()).resolves.toBeNull();

    expect(device).toEqual(plan("plan-1", 12));
    server.sendPlan.mockResolvedValue(plan("plan-1", 12));
    await syncPlan();
    expect(server.sendPlan).toHaveBeenLastCalledWith(plan("plan-1", 12));
  });
});

describe("syncPlan offline", () => {
  it("sends a save made offline once the connection is back", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    server.sendPlan.mockImplementationOnce(unreachable);
    await expect(syncPlan()).rejects.toThrow("Failed to fetch");

    server.sendPlan.mockResolvedValue(plan("plan-1", 11));
    await syncPlan();

    expect(server.sendPlan).toHaveBeenCalledTimes(2);
    expect(server.sendPlan).toHaveBeenLastCalledWith(plan("plan-1", 11));
  });

  it("runs one sync at a time", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    let inFlight = 0;
    let most = 0;
    server.sendPlan.mockImplementation(async (sent) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return sent;
    });
    server.accountPlan.mockResolvedValue(plan("plan-1", 11));

    await Promise.all([syncPlan(), syncPlan(), syncPlan()]);

    expect(most).toBe(1);
    expect(server.sendPlan).toHaveBeenCalledTimes(1);
  });
});

describe("syncPlan on starting the app", () => {
  it("holds the account's plan when it is newer", async () => {
    await joinedWith(plan("plan-1", 10));
    const newer = plan("plan-1", 20);
    server.accountPlan.mockResolvedValue(newer);

    await expect(syncPlan()).resolves.toEqual(newer);

    expect(server.sendPlan).not.toHaveBeenCalled();
    expect(device).toEqual(newer);
  });

  it("keeps the device's plan when the account holds the same one", async () => {
    await joinedWith(plan("plan-1", 10));
    server.accountPlan.mockResolvedValue(plan("plan-1", 10));

    await expect(syncPlan()).resolves.toBeNull();

    expect(server.sendPlan).not.toHaveBeenCalled();
    expect(holdCurriculum).not.toHaveBeenCalled();
  });

  it("sends the device's plan when the account has none", async () => {
    await joinedWith(plan("plan-1", 10));
    server.accountPlan.mockResolvedValue(null);
    server.sendPlan.mockResolvedValue(plan("plan-1", 10));

    await expect(syncPlan()).resolves.toBeNull();

    expect(server.sendPlan).toHaveBeenCalledWith(plan("plan-1", 10));
  });
});

describe("syncPlan adopting a plan", () => {
  it("takes the details of the account's plan on joining", async () => {
    device = plan("plan-device", 10);
    server.joinPlan.mockResolvedValue(forJss3("plan-account", 20));

    await syncPlan();

    expect(saveUserProfile).toHaveBeenCalledWith(JSS_3_LEARNER);
  });

  it("takes the details of a newer plan the server answers a save with", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    server.sendPlan.mockResolvedValue(forJss3("plan-2", 15));

    await syncPlan();

    expect(saveUserProfile).toHaveBeenCalledWith(JSS_3_LEARNER);
  });

  it("takes the details of the account's newer plan on starting", async () => {
    await joinedWith(plan("plan-1", 10));
    server.accountPlan.mockResolvedValue(forJss3("plan-1", 20));

    await syncPlan();

    expect(saveUserProfile).toHaveBeenCalledWith(JSS_3_LEARNER);
  });

  it("keeps the device's details when it keeps its plan", async () => {
    await joinedWith(plan("plan-1", 10));
    device = plan("plan-1", 11);
    server.sendPlan.mockResolvedValue(plan("plan-1", 11));

    await syncPlan();

    expect(saveUserProfile).not.toHaveBeenCalled();
  });
});
