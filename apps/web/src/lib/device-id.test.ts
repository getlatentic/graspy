import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: { load: vi.fn(async () => ({ get })) },
}));

const FINGERPRINT = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";

function stubStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return store;
}

async function fresh() {
  vi.resetModules();
  return import("./device-id");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  get.mockReset();
});

describe("the device id", () => {
  it("is the one kept on this device", async () => {
    stubStorage({ graspy_device_id: "kept-device-id" });
    const { deviceId } = await fresh();

    expect(deviceId()).toBe("kept-device-id");
  });

  it("is random when none is kept, and kept", async () => {
    const store = stubStorage();
    const { deviceId } = await fresh();

    const made = deviceId();

    expect(made).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId()).toBe(made);
    expect(store.get("graspy_device_id")).toBe(made);
  });

  it("is replaced by a new one, kept, after signing out", async () => {
    const store = stubStorage({ graspy_device_id: "kept-device-id" });
    const { deviceId, newDeviceId } = await fresh();

    const made = newDeviceId();

    expect(made).not.toBe("kept-device-id");
    expect(deviceId()).toBe(made);
    expect(store.get("graspy_device_id")).toBe(made);
  });

  it("is made again over a kept value the server would refuse", async () => {
    stubStorage({ graspy_device_id: "no spaces allowed" });
    const { deviceId } = await fresh();

    expect(deviceId()).not.toBe("no spaces allowed");
  });
});

describe("the fingerprint hint", () => {
  it("is made once a visit", async () => {
    get.mockResolvedValue({ visitorId: FINGERPRINT });
    const { fingerprint } = await fresh();

    expect(await fingerprint()).toBe(FINGERPRINT);
    expect(await fingerprint()).toBe(FINGERPRINT);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("is left out when fingerprinting fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    get.mockRejectedValue(new Error("blocked"));
    const { fingerprint } = await fresh();

    expect(await fingerprint()).toBeNull();
  });

  it("is not waited for past a second", async () => {
    vi.useFakeTimers();
    get.mockReturnValue(new Promise(() => {}));
    const { fingerprint } = await fresh();

    const hint = fingerprint();
    await vi.advanceTimersByTimeAsync(1000);

    expect(await hint).toBeNull();
  });
});
