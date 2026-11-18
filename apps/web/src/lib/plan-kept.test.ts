import { beforeEach, describe, expect, it, vi } from "vitest";

const changePlanRecord = vi.fn<(change: unknown) => Promise<void>>();
vi.mock("@/lib/learner-record", () => ({ changePlanRecord }));
let device = "device-aaaaaaaa";
vi.mock("@/lib/device-id", () => ({ deviceId: () => device }));

const { tellPlanKept } = await import("./plan-kept");

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
  return store;
}

describe("tellPlanKept", () => {
  beforeEach(() => {
    changePlanRecord.mockReset().mockResolvedValue(undefined);
    device = "device-aaaaaaaa";
    stubStorage();
  });

  it("tells the server once for a device and plan", async () => {
    await tellPlanKept("plan-1");
    await tellPlanKept("plan-1");
    expect(changePlanRecord).toHaveBeenCalledTimes(1);
    expect(changePlanRecord).toHaveBeenCalledWith({
      kind: "plan_kept",
      planId: "plan-1",
    });
  });

  it("tells it again when the plan changes", async () => {
    await tellPlanKept("plan-1");
    await tellPlanKept("plan-2");
    expect(changePlanRecord).toHaveBeenCalledTimes(2);
  });

  it("tells it again when the device is a new one", async () => {
    await tellPlanKept("plan-1");
    device = "device-bbbbbbbb";
    await tellPlanKept("plan-1");
    expect(changePlanRecord).toHaveBeenCalledTimes(2);
  });

  it("tries again next time after a failure", async () => {
    changePlanRecord.mockRejectedValueOnce(new Error("offline"));
    await expect(tellPlanKept("plan-1")).rejects.toThrow("offline");
    await tellPlanKept("plan-1");
    expect(changePlanRecord).toHaveBeenCalledTimes(2);
  });

  it("sends every time when storage is refused", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("refused");
        },
        setItem: () => {
          throw new Error("refused");
        },
      },
    });
    await tellPlanKept("plan-1");
    await tellPlanKept("plan-1");
    expect(changePlanRecord).toHaveBeenCalledTimes(2);
  });
});
