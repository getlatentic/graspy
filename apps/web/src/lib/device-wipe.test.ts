import { beforeEach, describe, expect, it, vi } from "vitest";

const cleared: string[] = [];
const STORES = ["curriculum", "lessons", "chat-history", "outbox"];
vi.mock("@/lib/idb", () => ({
  openDB: async () => ({
    objectStoreNames: STORES,
    transaction: () => ({
      objectStore: (name: string) => ({ clear: () => cleared.push(name) }),
    }),
  }),
  committed: async () => undefined,
}));

const newDeviceId = vi.fn();
vi.mock("@/lib/device-id", () => ({
  DEVICE_ID_KEY: "graspy_device_id",
  newDeviceId,
}));

const { wipeDevice, wipeLearnerData } = await import("./device-wipe");

// As the browser's: stored keys are its own enumerable properties.
function localStorageWith(entries: Record<string, string>) {
  const storage = { ...entries } as Record<string, unknown>;
  Object.defineProperty(storage, "removeItem", {
    value: (key: string) => delete storage[key],
  });
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

const DEVICE = {
  "graspy.account": "{}",
  graspy_device_id: "device-1",
  "firebase:authUser:key:[DEFAULT]": "{}",
  graspy_user_profile: "{}",
  "graspy.plan.joined": "uid/ada",
  "graspy.plan.agreed": "plan-1@1",
  "graspy.learner.plan-1": "{}",
  "graspy.records.imported": "1",
  "graspy.view.ui://graspy/lesson": "<html>",
  "graspy.service-consent.uid/ada": "1",
};

beforeEach(() => {
  cleared.length = 0;
  newDeviceId.mockClear();
});

describe("wipeLearnerData", () => {
  it("clears every store, and keeps only the account and the device id", async () => {
    const storage = localStorageWith(DEVICE);

    await wipeLearnerData();

    expect(cleared).toEqual(STORES);
    expect(Object.keys(storage).sort()).toEqual([
      "firebase:authUser:key:[DEFAULT]",
      "graspy.account",
      "graspy.service-consent.uid/ada",
      "graspy_device_id",
    ]);
    expect(newDeviceId).not.toHaveBeenCalled();
  });

  it("keeps what a parent agreed to, so the next learner's switch does not ask again", async () => {
    const storage = localStorageWith(DEVICE);

    await wipeLearnerData();

    expect(storage["graspy.service-consent.uid/ada"]).toBe("1");
  });
});

describe("wipeDevice", () => {
  it("leaves only Firebase's keys, agreements included, and gives the device a new id", async () => {
    const storage = localStorageWith(DEVICE);

    await wipeDevice();

    expect(cleared).toEqual(STORES);
    expect(Object.keys(storage)).toEqual(["firebase:authUser:key:[DEFAULT]"]);
    expect(newDeviceId).toHaveBeenCalled();
  });
});
