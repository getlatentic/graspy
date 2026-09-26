import { beforeEach, describe, expect, it, vi } from "vitest";

interface Signed {
  uid: string;
  learner: { id: string; name: string } | null;
  deviceJoins: boolean;
}
const ADA = { id: "ada000000001", name: "Ada" };
const GRACE = { id: "grace0000001", name: "Grace" };
let signedIn: Signed | null = null;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
}));

const steps: string[] = [];
const session = {
  keepLearnerSession: vi.fn(({ learner }: { learner: typeof ADA }) => {
    steps.push(`keep ${learner.id}`);
    signedIn = { ...signedIn!, learner, deviceJoins: false };
  }),
  leaveLearnerSession: vi.fn(() => {
    steps.push("leave");
    signedIn = { ...signedIn!, learner: null };
  }),
};
vi.mock("@/lib/api/session", () => session);

let plan: object | null = null;
vi.mock("@/lib/curriculum-db", () => ({ getCurriculum: async () => plan }));
vi.mock("@/lib/device-id", () => ({ deviceId: () => "device-1" }));
const wipeLearnerData = vi.fn(async () => void steps.push("wipe"));
vi.mock("@/lib/device-wipe", () => ({ wipeLearnerData }));
const sentEverything = vi.fn(async () => true);
vi.mock("@/lib/mcp/outbox", () => ({ sentEverything }));
const sentEveryAnswer = vi.fn(async (_: string) => true);
vi.mock("@/lib/voice/answer-outbox", () => ({ sentEveryAnswer }));
vi.mock("@/lib/voice/voice-learner-key", () => ({
  voiceLearnerKey: () =>
    signedIn?.learner ? `${signedIn.uid}/${signedIn.learner.id}` : null,
}));
const syncPlan = vi.fn(async () => {
  steps.push("sync");
  return null;
});
vi.mock("@/lib/plan-sync", () => ({ syncPlan }));
const wipeOnNextStart = vi.fn();
vi.mock("@/lib/wipe-pending", () => ({ wipeOnNextStart }));
const saveUserProfile = vi.fn();
vi.mock("@/lib/user-storage", () => ({ saveUserProfile }));
const api = {
  learnerSession: vi.fn(async (id: string) => ({
    token: "t",
    expiresIn: 60,
    learner: id === ADA.id ? ADA : GRACE,
  })),
  removeLearner: vi.fn(async () => []),
};
vi.mock("./learners-api", () => api);

const { UnsentChanges, chooseLearner, flushUnsent, forgetLearner } =
  await import("./learner-choice");

beforeEach(() => {
  vi.clearAllMocks();
  steps.length = 0;
  plan = { planId: "plan-1" };
  sentEverything.mockResolvedValue(true);
  sentEveryAnswer.mockResolvedValue(true);
  vi.stubGlobal("navigator", { onLine: true });
});

describe("the first learner chosen after signing in", () => {
  beforeEach(() => {
    signedIn = { uid: "uid-1", learner: null, deviceJoins: true };
  });

  it("takes in the device's record and joins its plan, wiping nothing", async () => {
    await expect(chooseLearner(ADA)).resolves.toBe("/app/learn");

    expect(api.learnerSession).toHaveBeenCalledWith(ADA.id, "device-1");
    expect(steps).toEqual([`keep ${ADA.id}`, "sync"]);
    expect(saveUserProfile).toHaveBeenCalledWith({ onboardingCompleted: true });
  });

  it("is chosen even when the plan joins later, offline", async () => {
    syncPlan.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(chooseLearner(ADA)).resolves.toBe("/app/learn");
    expect(signedIn?.learner).toEqual(ADA);
  });
});

describe("switching to another learner", () => {
  beforeEach(() => {
    signedIn = { uid: "uid-1", learner: ADA, deviceJoins: false };
  });

  it("sends what is unsent, wipes the device, then takes the learner's plan", async () => {
    await chooseLearner(GRACE);

    expect(api.learnerSession).toHaveBeenCalledWith(GRACE.id);
    expect(steps).toEqual([
      "sync",
      "wipe",
      "leave",
      `keep ${GRACE.id}`,
      "sync",
    ]);
  });

  it("opens onboarding for a learner with no plan", async () => {
    plan = null;

    await expect(chooseLearner(GRACE)).resolves.toBe("/app/onboarding");
    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["offline", true, () => vi.stubGlobal("navigator", { onLine: false })],
    [
      "the plan cannot be sent",
      false,
      () => syncPlan.mockRejectedValueOnce(new TypeError()),
    ],
    [
      "a kept call cannot be sent",
      false,
      () => sentEverything.mockResolvedValue(false),
    ],
    [
      "a kept spoken answer cannot be sent",
      false,
      () => sentEveryAnswer.mockResolvedValue(false),
    ],
  ])("is refused, wiping nothing, when %s", async (_, offline, arrange) => {
    arrange();

    const refusal = await chooseLearner(GRACE).catch((error) => error);

    expect(refusal).toBeInstanceOf(UnsentChanges);
    expect(refusal).toMatchObject({ offline });
    expect(wipeLearnerData).not.toHaveBeenCalled();
    expect(signedIn?.learner).toEqual(ADA);
  });

  it("goes ahead once asked to lose what cannot be sent", async () => {
    sentEverything.mockResolvedValue(false);

    await expect(chooseLearner(GRACE, { loseUnsent: true })).resolves.toBe(
      "/app/learn",
    );

    expect(sentEverything).not.toHaveBeenCalled();
    expect(steps).toEqual(["wipe", "leave", `keep ${GRACE.id}`, "sync"]);
  });

  it("wipes nothing when graspy cannot issue the learner's session", async () => {
    api.learnerSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(chooseLearner(GRACE, { loseUnsent: true })).rejects.toThrow(
      "Failed to fetch",
    );

    expect(wipeLearnerData).not.toHaveBeenCalled();
    expect(signedIn?.learner).toEqual(ADA);
  });

  it("leaves the device with no learner when their plan cannot be read", async () => {
    syncPlan
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(chooseLearner(GRACE)).rejects.toThrow("Failed to fetch");

    expect(signedIn?.learner).toBeNull();
  });

  it("does nothing for the learner already in use", async () => {
    await expect(chooseLearner(ADA)).resolves.toBe("/app/learn");

    expect(api.learnerSession).not.toHaveBeenCalled();
    expect(wipeLearnerData).not.toHaveBeenCalled();
    expect(wipeOnNextStart).not.toHaveBeenCalled();
  });
});

describe("a choice after the device's learner was removed", () => {
  it("wipes without asking to send anything first", async () => {
    signedIn = { uid: "uid-1", learner: null, deviceJoins: false };
    vi.stubGlobal("navigator", { onLine: false });

    await chooseLearner(GRACE);

    expect(steps).toEqual(["wipe", "leave", `keep ${GRACE.id}`, "sync"]);
  });
});

describe("flushUnsent", () => {
  it("is true once the plan and every kept call reached the server", async () => {
    signedIn = { uid: "uid-1", learner: ADA, deviceJoins: false };

    await expect(flushUnsent()).resolves.toBe(true);
    expect(syncPlan).toHaveBeenCalled();
    expect(sentEverything).toHaveBeenCalled();
    expect(sentEveryAnswer).toHaveBeenCalledWith(`uid-1/${ADA.id}`);
  });

  it("is false, so signing out asks first, while a spoken answer is still kept", async () => {
    signedIn = { uid: "uid-1", learner: ADA, deviceJoins: false };
    sentEveryAnswer.mockResolvedValue(false);

    await expect(flushUnsent()).resolves.toBe(false);
  });
});

describe("forgetLearner", () => {
  it("leaves the learner in use", async () => {
    signedIn = { uid: "uid-1", learner: ADA, deviceJoins: false };

    await expect(forgetLearner(ADA.id)).resolves.toBe(true);

    expect(api.removeLearner).toHaveBeenCalledWith(ADA.id);
    expect(steps).toEqual(["wipe", "leave"]);
    expect(wipeOnNextStart).toHaveBeenCalledWith("learner");
  });

  it("keeps the device as it is for another learner", async () => {
    signedIn = { uid: "uid-1", learner: ADA, deviceJoins: false };

    await expect(forgetLearner(GRACE.id)).resolves.toBe(false);

    expect(wipeLearnerData).not.toHaveBeenCalled();
    expect(wipeOnNextStart).not.toHaveBeenCalled();
  });
});
