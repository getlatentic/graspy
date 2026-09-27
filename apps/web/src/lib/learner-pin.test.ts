import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "./account/account-store";
import { LearnerChanged, pinTo } from "./learner-pin";

describe("work pinned to a learner", () => {
  it("holds for the device's turn with them, and stops once the turn ends", () => {
    let turn = 0;
    const pin = pinTo("uid-1/ada", () => turn);

    expect(pin.learner).toBe("uid-1/ada");
    expect(pin.holds()).toBe(true);
    expect(() => pin.hold()).not.toThrow();

    turn += 1;

    expect(pin.holds()).toBe(false);
    expect(() => pin.hold()).toThrow(LearnerChanged);
  });

  it("stays stopped when the device comes back to them: the device was wiped between", () => {
    let turn = 0;
    const pin = pinTo("uid-1/ada", () => turn);
    turn += 1;
    const grace = pinTo("uid-1/grace", () => turn);
    turn += 1;

    expect(grace.holds()).toBe(false);
    expect(pin.holds()).toBe(false);
  });
});

const IDENTITY = { uid: "uid-1", name: "Ada's family", email: null };
const SIGNED_IN: Account = { ...IDENTITY, learner: null, deviceJoins: true };
const ADA = { id: "ada", name: "Ada" };
const GRACE = { id: "grace", name: "Grace" };

async function fresh() {
  vi.resetModules();
  return {
    store: await import("./account/account-store"),
    ...(await import("./learner-pin")),
  };
}

beforeEach(() => vi.unstubAllGlobals());

describe("work pinned to whoever the device learns as", () => {
  it("is named for the device signed out, the account, or the account's learner", async () => {
    const { store, pinLearner } = await fresh();

    expect(pinLearner().learner).toBe("device");
    store.setAccount(SIGNED_IN);
    expect(pinLearner().learner).toBe("uid-1");
    store.setLearner(ADA);
    expect(pinLearner().learner).toBe("uid-1/ada");
  });

  it("holds through signing in and choosing the first learner, whom the device's work joins", async () => {
    const { store, pinLearner } = await fresh();
    const pin = pinLearner();

    store.setAccount(SIGNED_IN);
    store.setLearner(ADA);

    expect(pin.holds()).toBe(true);
  });

  it("stops on signing out, though every signed-out device is named alike", async () => {
    const { store, pinLearner } = await fresh();
    const pin = pinLearner();
    store.setAccount(SIGNED_IN);

    store.setAccount(null);

    expect(pinLearner().learner).toBe(pin.learner);
    expect(pin.holds()).toBe(false);
  });

  it("stops on switching to another learner, and on leaving one", async () => {
    const { store, pinLearner } = await fresh();
    store.setAccount({ ...SIGNED_IN, learner: ADA, deviceJoins: false });
    const ada = pinLearner();

    store.setLearner(GRACE);
    const grace = pinLearner();
    store.setLearner(null);

    expect(ada.holds()).toBe(false);
    expect(grace.holds()).toBe(false);
  });

  it("stops for a learner chosen after one was left, who starts on a wiped device", async () => {
    const { store, pinLearner } = await fresh();
    store.setAccount({ ...SIGNED_IN, learner: ADA, deviceJoins: false });
    store.setLearner(null);
    const left = pinLearner();

    store.setLearner(GRACE);

    expect(left.holds()).toBe(false);
  });

  it("holds through the learner's new name", async () => {
    const { store, pinLearner } = await fresh();
    store.setAccount({ ...SIGNED_IN, learner: ADA, deviceJoins: false });
    const pin = pinLearner();

    store.setLearner({ ...ADA, name: "Ada L." });

    expect(pin.holds()).toBe(true);
  });
});
