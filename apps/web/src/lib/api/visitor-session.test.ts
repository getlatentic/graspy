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

async function load() {
  vi.resetModules();
  const [session, visitor, chat] = await Promise.all([
    import("./session"),
    import("./visitor-session"),
    import("./chat-session"),
  ]);
  return { ...session, ...visitor, ...chat };
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

describe("a visitor's session", () => {
  it("names no device and sends no fingerprint, so the server has nothing to keep it under", async () => {
    fetchMock.mockResolvedValue(minted("nobody"));
    const { getVisitorToken } = await load();

    await expect(getVisitorToken()).resolves.toBe("nobody");
    await expect(getVisitorToken()).resolves.toBe("nobody");

    expect(sentBodies(fetchMock)).toEqual([
      { visitor: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
  });

  it("is made once for requests that ask together", async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(minted("any")), 5)),
    );
    const { getVisitorToken } = await load();

    await Promise.all([getVisitorToken(), getVisitorToken()]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("asks for each renewal under the same visitor, so the chats begun stay the visitor's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValueOnce(minted("first"));
    fetchMock.mockResolvedValueOnce(minted("renewed"));
    const { getVisitorToken } = await load();
    await getVisitorToken();

    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);

    await expect(getVisitorToken()).resolves.toBe("renewed");
    const [first, renewed] = sentBodies(fetchMock);
    expect(renewed.visitor).toBe(first.visitor);
    vi.useRealTimers();
  });

  it("names the same visitor each time, so their chats are theirs across loads", async () => {
    fetchMock.mockResolvedValue(minted("nobody"));
    const first = await load();
    await first.getVisitorToken();
    const second = await load();
    await second.refreshVisitorToken();

    const [one, two] = sentBodies(fetchMock);
    expect(one.visitor).toBe(two.visitor);
  });
});

describe("the session the chat runs under", () => {
  it("is the visitor's while nobody is signed in, and the device's own is another", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      minted(JSON.parse(init.body).visitor ? "nobody" : "device"),
    );
    const { chatTokens, getSessionToken } = await load();

    await expect(chatTokens.get()).resolves.toBe("nobody");
    await expect(getSessionToken()).resolves.toBe("device");

    // Each is held: asking again, in either order, makes neither again.
    await expect(chatTokens.get()).resolves.toBe("nobody");
    await expect(getSessionToken()).resolves.toBe("device");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBodies(fetchMock)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deviceId: DEVICE }),
        { visitor: expect.any(String) },
      ]),
    );
  });

  it("is the account's once someone is signed in, which no visitor handshake is made for", async () => {
    fetchMock.mockResolvedValue(minted("account"));
    const { chatTokens } = await load();
    signedIn = {
      uid: "uid-1",
      name: "Ada",
      email: "ada@example.com",
      learner: null,
      deviceJoins: true,
    };

    await expect(chatTokens.get()).resolves.toBe("account");

    expect(sentBodies(fetchMock)).toEqual([
      expect.objectContaining({
        deviceId: DEVICE,
        firebaseIdToken: "google-token",
      }),
    ]);
  });

  it("is made again, once, when the server refuses it", async () => {
    fetchMock.mockImplementation(
      async (url: string, init: { body: string }) => {
        if (String(url).endsWith("/session")) {
          return minted(JSON.parse(init.body).visitor ? "new" : "device");
        }
        const sent = (init as unknown as { headers: Headers }).headers;
        return new Response("", {
          status: sent.get("Authorization") === "Bearer new" ? 200 : 401,
        });
      },
    );
    const { fetchForChat } = await load();

    const response = await fetchForChat("https://api.example/chats");

    expect(response.status).toBe(200);
  });
});
