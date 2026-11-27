import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => null,
}));
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => null,
  setAccount: vi.fn(),
  setLearner: vi.fn(),
}));
vi.mock("@/lib/device-wipe", () => ({ wipeDevice: async () => undefined }));

let siteKey: string | null = "site-key";
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  get TURNSTILE_SITE_KEY() {
    return siteKey;
  },
}));

async function load() {
  vi.resetModules();
  const visitor = await import("./visitor-session");
  const device = await import("./session");
  const challenge = await import("@/lib/challenge/challenge");
  const errors = await import("./errors");
  return { ...device, ...visitor, ...challenge, ...errors };
}

const minted = (token: string) =>
  new Response(JSON.stringify({ token, expiresIn: 12 * 3600 }));
const refused = (status: number, code: string) =>
  new Response(JSON.stringify({ detail: { error: "no", code } }), { status });

const sentBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  siteKey = "site-key";
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => void session.set(k, v),
      removeItem: (k: string) => void session.delete(k),
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

describe("the check that a visitor is a person", () => {
  it("runs before the visitor's first session and sends its token with the request", async () => {
    fetchMock.mockResolvedValue(minted("session"));
    const { getVisitorToken, hostChallenge } = await load();
    const solve = vi.fn(async () => "turnstile-token");
    hostChallenge({ solve });

    await expect(getVisitorToken()).resolves.toBe("session");

    expect(sentBodies(fetchMock)).toEqual([
      { visitor: expect.any(String), challenge: "turnstile-token" },
    ]);
    expect(solve).toHaveBeenCalledOnce();
  });

  it("is run once for a visit, not for each message or each request at once", async () => {
    fetchMock.mockResolvedValue(minted("session"));
    const { getVisitorToken, hostChallenge } = await load();
    const solve = vi.fn(async () => "turnstile-token");
    hostChallenge({ solve });

    await Promise.all([getVisitorToken(), getVisitorToken()]);
    await getVisitorToken();
    await getVisitorToken();

    expect(solve).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("is not run for a renewal, which presents the session it replaces", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValueOnce(minted("first"));
    fetchMock.mockResolvedValueOnce(minted("renewed"));
    const { getVisitorToken, hostChallenge } = await load();
    const solve = vi.fn(async () => "turnstile-token");
    hostChallenge({ solve });
    await getVisitorToken();

    vi.setSystemTime(Date.now() + 12 * 3600 * 1000 - 60_000);
    await expect(getVisitorToken()).resolves.toBe("renewed");

    expect(solve).toHaveBeenCalledOnce();
    expect(sentBodies(fetchMock)[1]).toEqual({
      visitor: expect.any(String),
      renewal: "first",
    });
    vi.useRealTimers();
  });

  it("is run again when the server will not renew the session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValueOnce(minted("first"));
    fetchMock.mockResolvedValueOnce(refused(403, "challenge_required"));
    fetchMock.mockResolvedValueOnce(minted("again"));
    const { getVisitorToken, hostChallenge } = await load();
    const solve = vi.fn(async () => "fresh-token");
    hostChallenge({ solve });
    await getVisitorToken();

    vi.setSystemTime(Date.now() + 12 * 3600 * 1000 - 60_000);
    await expect(getVisitorToken()).resolves.toBe("again");

    expect(solve).toHaveBeenCalledTimes(2);
    expect(sentBodies(fetchMock)[2]).toMatchObject({
      challenge: "fresh-token",
    });
    vi.useRealTimers();
  });

  it("is never run for a device's own session", async () => {
    fetchMock.mockResolvedValue(minted("device"));
    const { getSessionToken, hostChallenge } = await load();
    const solve = vi.fn(async () => "turnstile-token");
    hostChallenge({ solve });

    await getSessionToken();

    expect(solve).not.toHaveBeenCalled();
    expect(sentBodies(fetchMock)[0]).toMatchObject({ deviceId: DEVICE });
  });

  it("is not run in a build with no widget, which sends the visitor as before", async () => {
    siteKey = null;
    fetchMock.mockResolvedValue(minted("session"));
    const { getVisitorToken } = await load();

    await getVisitorToken();

    expect(sentBodies(fetchMock)).toEqual([{ visitor: expect.any(String) }]);
  });

  it("is refused with the server's code when its token fails, and mints no session", async () => {
    fetchMock.mockResolvedValue(refused(403, "challenge_failed"));
    const { getVisitorToken, hostChallenge, ApiError } = await load();
    hostChallenge({ solve: async () => "bad" });

    const failure = await getVisitorToken().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as { code: unknown }).code).toBe("challenge_failed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails when no page hosts the check, so nothing outside /try loads Turnstile", async () => {
    const { getVisitorToken, ChallengeError } = await load();

    await expect(getVisitorToken()).rejects.toBeInstanceOf(ChallengeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the widget's own failure on, as one the page can word", async () => {
    const { getVisitorToken, hostChallenge, ChallengeError } = await load();
    hostChallenge({
      solve: () => Promise.reject(new ChallengeError("unsupported")),
    });

    await expect(getVisitorToken()).rejects.toMatchObject({
      kind: "unsupported",
    });
  });

  it("sends a 503 from the server on as a retryable answer", async () => {
    fetchMock.mockResolvedValue(refused(503, "challenge_unavailable"));
    const { getVisitorToken, hostChallenge } = await load();
    hostChallenge({ solve: async () => "t" });

    await expect(getVisitorToken()).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
  });
});
