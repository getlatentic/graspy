import { beforeEach, describe, expect, it, vi } from "vitest";

// The real session module and the real PIN calls, over a fake `fetch`: what leaves the page is
// what these read, so the PIN is checked where it is sent, not in a stand-in.

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => null,
}));
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => ({ uid: "uid-1", name: "Ada", learner: null }),
  setAccount: vi.fn(),
  setLearner: vi.fn(),
}));
vi.mock("@/lib/account/google-auth", () => ({
  googleIdToken: async () => "id-token",
}));
vi.mock("@/lib/device-wipe", () => ({ wipeDevice: async () => undefined }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const PIN = "482915";
const fetchMock = vi.fn();
const stored = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => stored.set(key, value));

const answer = (status: number, body: object = {}) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  stored.clear();
  setItem.mockClear();
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem,
      removeItem: (key: string) => stored.delete(key),
    },
    localStorage: { getItem: () => null, setItem, removeItem: () => undefined },
  });
});

async function typedOnce() {
  fetchMock.mockResolvedValueOnce(
    answer(200, { token: "account-token", expiresIn: 3600 }),
  );
  fetchMock.mockResolvedValueOnce(
    answer(200, { token: "parent-token", expiresIn: 900 }),
  );
  const { verifyPin } = await import("./parent-pin-api");
  await verifyPin(PIN);
}

describe("the PIN, as it leaves the page", () => {
  it("is in the JSON body of the verify call, and nowhere else it is sent", async () => {
    const log = vi.spyOn(console, "warn");
    await typedOnce();

    const sent = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/account/parent-pin/verify"),
    );
    expect(sent).toHaveLength(1);
    const [url, init] = sent[0];
    expect(JSON.parse(init.body)).toEqual({ pin: PIN });
    expect(String(url)).not.toContain(PIN);
    for (const [other, otherInit] of fetchMock.mock.calls) {
      expect(String(other)).not.toContain(PIN);
      for (const header of new Headers(otherInit?.headers).values()) {
        expect(header).not.toContain(PIN);
      }
      if (other !== url)
        expect(String(otherInit?.body ?? "")).not.toContain(PIN);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain(PIN);
  });

  it("is kept in no storage, however the parent's session is made", async () => {
    await typedOnce();

    expect(JSON.stringify([...stored.values()])).not.toContain(PIN);
    for (const [, value] of setItem.mock.calls) {
      expect(value).not.toContain(PIN);
    }
  });

  it("is in the body of the save call, with the Google token, and in no address", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { token: "account-token", expiresIn: 3600 }),
    );
    fetchMock.mockResolvedValueOnce(
      answer(200, { token: "parent-token", expiresIn: 900 }),
    );
    const { savePin } = await import("./parent-pin-api");

    await savePin(PIN, { firebaseIdToken: "fresh" });

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe("https://api.test/api/account/parent-pin");
    expect(JSON.parse(init.body)).toEqual({
      pin: PIN,
      firebaseIdToken: "fresh",
    });
    expect(init.method).toBe("PUT");
  });

  it("is not in the error a wrong PIN raises, which the app shows and logs", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { token: "account-token", expiresIn: 3600 }),
    );
    fetchMock.mockResolvedValueOnce(
      answer(403, {
        detail: { code: "pin_wrong", attemptsLeft: 3, error: "no" },
      }),
    );
    const { verifyPin, pinRefusalOf } = await import("./parent-pin-api");

    const failure = await verifyPin(PIN).catch((error: unknown) => error);

    expect(JSON.stringify(failure)).not.toContain(PIN);
    expect(String((failure as Error).message)).not.toContain(PIN);
    expect(pinRefusalOf(failure)).toEqual({ kind: "wrong", attemptsLeft: 3 });
  });
});

describe("the parent's session made from the PIN", () => {
  it("knows how old it is, and can be dropped so the gate asks again", async () => {
    await typedOnce();
    const session = await import("@/lib/api/session");
    const heard = vi.fn();
    session.subscribeParentSession(heard);

    expect(session.hasParentSession()).toBe(true);
    expect(session.parentSessionAge()).toBeLessThan(1000);
    session.dropParentSession();

    expect(session.hasParentSession()).toBe(false);
    expect(session.parentSessionAge()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
