import { beforeEach, describe, expect, it, vi } from "vitest";

const wipes = {
  wipeDevice: vi.fn(async () => undefined),
  wipeLearnerData: vi.fn(async () => undefined),
};
vi.mock("./device-wipe", () => wipes);

const { finishPendingWipe, wipeOnNextStart } = await import("./wipe-pending");

beforeEach(() => {
  vi.clearAllMocks();
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
});

describe("a wipe pending from the last start", () => {
  it("wipes nothing when none is pending", async () => {
    await finishPendingWipe();

    expect(wipes.wipeDevice).not.toHaveBeenCalled();
    expect(wipes.wipeLearnerData).not.toHaveBeenCalled();
  });

  it.each([
    ["device", "wipeDevice"],
    ["learner", "wipeLearnerData"],
  ] as const)("finishes a %s wipe", async (wipe, done) => {
    wipeOnNextStart(wipe);

    await finishPendingWipe();

    expect(wipes[done]).toHaveBeenCalled();
  });
});
