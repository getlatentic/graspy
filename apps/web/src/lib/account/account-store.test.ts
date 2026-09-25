import { beforeEach, describe, expect, it, vi } from "vitest";

function stubStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return store;
}

async function fresh() {
  vi.resetModules();
  return import("./account-store");
}

const IDENTITY = { uid: "uid-1", name: "Ada Lovelace", email: "a@example.com" };
const ADA = { id: "a1b2c3d4e5f6", name: "Ada" };

beforeEach(() => vi.unstubAllGlobals());

describe("the account kept on the device", () => {
  it("reads one kept before accounts held learners as joining the first chosen", async () => {
    stubStorage({ "graspy.account": JSON.stringify(IDENTITY) });
    const { currentAccount } = await fresh();

    expect(currentAccount()).toEqual({
      ...IDENTITY,
      learner: null,
      deviceJoins: true,
    });
  });

  it("keeps the learner chosen, which ends the device's joining", async () => {
    const store = stubStorage();
    const { currentAccount, setAccount, setLearner } = await fresh();
    setAccount({ ...IDENTITY, learner: null, deviceJoins: true });

    setLearner(ADA);

    expect(currentAccount()).toMatchObject({
      learner: ADA,
      deviceJoins: false,
    });
    expect(JSON.parse(store.get("graspy.account")!)).toMatchObject({
      learner: ADA,
      deviceJoins: false,
    });
  });

  it("leaves a learner without the device joining the next", async () => {
    stubStorage();
    const { currentAccount, setAccount, setLearner } = await fresh();
    setAccount({ ...IDENTITY, learner: ADA, deviceJoins: false });

    setLearner(null);

    expect(currentAccount()).toMatchObject({
      learner: null,
      deviceJoins: false,
    });
  });

  it("names where plan sync keeps what it agreed with the learner", async () => {
    stubStorage();
    const { learnerKeyOf } = await fresh();
    const account = { ...IDENTITY, deviceJoins: false };

    expect(learnerKeyOf({ ...account, learner: ADA })).toBe(`uid-1/${ADA.id}`);
    expect(learnerKeyOf({ ...account, learner: null })).toBeNull();
  });
});
