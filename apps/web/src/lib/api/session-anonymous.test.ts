import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => "ffeeddccbbaa99887766554433221100",
}));

interface Signed {
  uid: string;
  name: string;
  email: string;
  learner: null;
  deviceJoins: boolean;
}
let signedIn: Signed | null = null;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  setAccount: vi.fn(),
  setLearner: vi.fn(),
}));
vi.mock("@/lib/account/google-auth", () => ({
  googleIdToken: async () => "google-token",
}));
vi.mock("@/lib/device-wipe", () => ({ wipeDevice: async () => undefined }));

async function loadSession() {
  vi.resetModules();
  return import("./session");
}

function minted(token: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ token, expiresIn: 3600 }),
  };
}

const sentBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  signedIn = null;
  const store = new Map<string, string>();
  const local = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
    },
    location: { assign: vi.fn() },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("a session held anonymous, as on /try", () => {
  it("names no device and sends no fingerprint, so the server has nothing to keep it under", async () => {
    fetchMock.mockResolvedValue(minted("nobody"));
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    holdAnonymousSession();

    await expect(getSessionToken()).resolves.toBe("nobody");
    await expect(getSessionToken()).resolves.toBe("nobody");

    expect(sentBodies(fetchMock)).toEqual([
      { visitor: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
  });

  it("asks for each renewal under the same visitor, so the chats begun stay the visitor's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValueOnce(minted("first"));
    fetchMock.mockResolvedValueOnce(minted("renewed"));
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    holdAnonymousSession();
    await getSessionToken();

    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);

    await expect(getSessionToken()).resolves.toBe("renewed");
    const [first, renewed] = sentBodies(fetchMock);
    expect(renewed.visitor).toBe(first.visitor);
    vi.useRealTimers();
  });

  it("is not served by the device's own token, which names the device", async () => {
    fetchMock.mockResolvedValueOnce(minted("device"));
    fetchMock.mockResolvedValueOnce(minted("nobody"));
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    await getSessionToken();

    holdAnonymousSession();

    await expect(getSessionToken()).resolves.toBe("nobody");
    expect(sentBodies(fetchMock)[0]).toMatchObject({ deviceId: DEVICE });
  });

  it("gives the device its own session back once released, not the anonymous token", async () => {
    fetchMock.mockResolvedValueOnce(minted("nobody"));
    fetchMock.mockResolvedValueOnce(minted("device"));
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    const release = holdAnonymousSession();
    await getSessionToken();

    release();

    await expect(getSessionToken()).resolves.toBe("device");
    expect(sentBodies(fetchMock)[1]).toMatchObject({ deviceId: DEVICE });
  });

  it("does not hand one visit's handshake to the other kind of session", async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(minted("any")), 5)),
    );
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    const device = getSessionToken();
    holdAnonymousSession();
    const nobody = getSessionToken();

    await Promise.all([device, nobody]);

    // The device's handshake waits for its fingerprint, so which is sent first is not the point.
    expect(sentBodies(fetchMock)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deviceId: DEVICE }),
        { visitor: expect.any(String) },
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the same visitor each time, so their chats are theirs across sessions", async () => {
    fetchMock.mockResolvedValue(minted("nobody"));
    const first = await loadSession();
    first.holdAnonymousSession();
    await first.getSessionToken();
    const second = await loadSession();
    second.holdAnonymousSession();
    await second.refreshSessionToken();

    const [one, two] = sentBodies(fetchMock);
    expect(one.visitor).toBe(two.visitor);
  });

  it("is not kept, nor handed on, when the page is left while the handshake runs", async () => {
    fetchMock.mockImplementation(
      async (_url: string, init: { body: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return minted(JSON.parse(init.body).visitor ? "nobody" : "device");
      },
    );
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    const release = holdAnonymousSession();
    const asked = getSessionToken();
    release();

    await expect(asked).resolves.toBe("device");
    await expect(getSessionToken()).resolves.toBe("device");
  });

  it("does not let a device handshake that ends during a hold replace the anonymous token", async () => {
    let finishDevice: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      async (_url: string, init: { body: string }) => {
        if (JSON.parse(init.body).visitor) return minted("nobody");
        return new Promise((resolve) => {
          finishDevice = resolve;
        });
      },
    );
    const { getSessionToken, holdAnonymousSession } = await loadSession();
    const device = getSessionToken();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    holdAnonymousSession();
    await getSessionToken();

    finishDevice(minted("device"));
    await device;

    await expect(getSessionToken()).resolves.toBe("nobody");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is not in force once someone is signed in", async () => {
    const { isAnonymousSession, holdAnonymousSession } = await loadSession();
    holdAnonymousSession();
    expect(isAnonymousSession()).toBe(true);

    signedIn = {
      uid: "uid-1",
      name: "Ada",
      email: "ada@example.com",
      learner: null,
      deviceJoins: true,
    };

    expect(isAnonymousSession()).toBe(false);
  });
});
