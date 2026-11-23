import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => "ffeeddccbbaa99887766554433221100",
}));

interface Signed {
  uid: string;
  name: string | null;
  email: string | null;
  learner: { id: string; name: string } | null;
  deviceJoins: boolean;
}
let signedIn: Signed | null = null;
const setAccount = vi.fn((account: Signed | null) => {
  signedIn = account;
});
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  setAccount,
  setLearner: vi.fn(),
}));
const googleIdToken = vi.fn();
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));
const wipeDevice = vi.fn(async () => undefined);
vi.mock("@/lib/device-wipe", () => ({ wipeDevice }));
const assign = vi.fn();

const APPROVAL = {
  token: "tv-session-1",
  expiresIn: 3600,
  refreshToken: "tv-credential",
  account: "uid-1",
  learner: { id: "a1b2c3d4e5f6", name: "Ada" },
};

async function loadSession() {
  vi.resetModules();
  return import("./session");
}

let local: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

function stubStorage() {
  local = new Map<string, string>();
  const session = new Map<string, string>();
  const storage = (store: Map<string, string>) => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", {
    localStorage: storage(local),
    sessionStorage: storage(session),
    location: { assign },
  });
}

const answer = (status: number, body: object = {}) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  signedIn = null;
  setAccount.mockClear();
  googleIdToken.mockReset();
  wipeDevice.mockClear();
  assign.mockClear();
  stubStorage();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("a TV signed in from a phone", () => {
  it("learns as the learner the phone chose, with no joining of the device's own plan", async () => {
    const { startTvSession } = await loadSession();

    startTvSession(APPROVAL);

    expect(signedIn).toEqual({
      uid: "uid-1",
      name: null,
      email: null,
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      deviceJoins: false,
    });
    expect(local.get("graspy.tv-credential")).toBe("tv-credential");
  });

  it("uses the session it was given without asking the server", async () => {
    const { startTvSession, getSessionToken } = await loadSession();
    startTvSession(APPROVAL);

    await expect(getSessionToken()).resolves.toBe("tv-session-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renews the session from its credential, never from Google", async () => {
    vi.useFakeTimers();
    const { startTvSession, getSessionToken } = await loadSession();
    startTvSession(APPROVAL);
    vi.setSystemTime(Date.now() + 3_500_000);
    fetchMock.mockResolvedValue(
      answer(200, {
        token: "tv-session-2",
        expiresIn: 3600,
        signedIn: true,
        learner: APPROVAL.learner,
      }),
    );

    await expect(getSessionToken()).resolves.toBe("tv-session-2");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/tv-sign-in\/session$/);
    expect(JSON.parse(init.body)).toEqual({ refreshToken: "tv-credential" });
    expect(googleIdToken).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])(
    "is signed out when the server answers %s to a renewal: nothing of it stays",
    async (status) => {
      vi.useFakeTimers();
      const { startTvSession, getSessionToken } = await loadSession();
      startTvSession(APPROVAL);
      vi.setSystemTime(Date.now() + 3_500_000);
      fetchMock.mockResolvedValue(answer(status, { detail: { code: "x" } }));

      await expect(getSessionToken()).rejects.toMatchObject({ status: 401 });

      expect(local.has("graspy.tv-credential")).toBe(false);
      expect(signedIn).toBeNull();
      expect(wipeDevice).toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith("/");
    },
  );

  it("is not signed out by a server that is busy: it keeps its credential and tries again later", async () => {
    vi.useFakeTimers();
    const { startTvSession, getSessionToken } = await loadSession();
    startTvSession(APPROVAL);
    vi.setSystemTime(Date.now() + 3_500_000);
    fetchMock.mockResolvedValue(answer(503, { detail: { code: "later" } }));

    await expect(getSessionToken()).rejects.toMatchObject({ status: 503 });

    expect(local.get("graspy.tv-credential")).toBe("tv-credential");
    expect(signedIn).not.toBeNull();
  });

  it("keeps the credential each renewal returns, which replaces the one it spent", async () => {
    vi.useFakeTimers();
    const { startTvSession, getSessionToken } = await loadSession();
    startTvSession(APPROVAL);
    vi.setSystemTime(Date.now() + 3_500_000);
    fetchMock.mockResolvedValueOnce(
      answer(200, {
        token: "tv-session-2",
        expiresIn: 3600,
        signedIn: true,
        learner: APPROVAL.learner,
        refreshToken: "tv-credential-2",
      }),
    );
    await getSessionToken();
    expect(local.get("graspy.tv-credential")).toBe("tv-credential-2");

    vi.setSystemTime(Date.now() + 3_500_000);
    fetchMock.mockResolvedValueOnce(
      answer(200, {
        token: "tv-session-3",
        expiresIn: 3600,
        signedIn: true,
        learner: APPROVAL.learner,
        refreshToken: "tv-credential-3",
      }),
    );
    await getSessionToken();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      refreshToken: "tv-credential-2",
    });
    expect(local.get("graspy.tv-credential")).toBe("tv-credential-3");
  });

  it("keeps its credential through a failed attempt to reach the server", async () => {
    vi.useFakeTimers();
    const { startTvSession, getSessionToken } = await loadSession();
    startTvSession(APPROVAL);
    vi.setSystemTime(Date.now() + 3_500_000);
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await expect(getSessionToken()).rejects.toMatchObject({ status: 0 });

    expect(local.get("graspy.tv-credential")).toBe("tv-credential");
    expect(signedIn).not.toBeNull();
  });

  it("forgets its credential when the account session ends", async () => {
    const { startTvSession, endAccountSession } = await loadSession();
    startTvSession(APPROVAL);

    endAccountSession();

    expect(local.has("graspy.tv-credential")).toBe(false);
  });
});
