import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const FINGERPRINT = "ffeeddccbbaa99887766554433221100";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => FINGERPRINT,
}));

const ACCOUNT = { uid: "uid-1", name: "Ada", email: "ada@example.com" };
let signedIn: typeof ACCOUNT | null = null;
const setAccount = vi.fn((account: typeof ACCOUNT | null) => {
  signedIn = account;
});
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  setAccount,
}));
const googleIdToken = vi.fn<(fresh: boolean) => Promise<string | null>>();
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));

// Fresh per test: the module holds the tab's token, and ApiError must come from
// the same reloaded graph for `instanceof` to hold.
async function loadSession() {
  vi.resetModules();
  const [session, errors] = await Promise.all([
    import("./session"),
    import("./errors"),
  ]);
  return { ...session, ApiError: errors.ApiError };
}

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

function minted(token: string, expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ token, expiresIn }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  signedIn = null;
  setAccount.mockClear();
  googleIdToken.mockReset();
  stubStorage();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("getSessionToken", () => {
  it("mints once, naming the device with its fingerprint, then reuses the token", async () => {
    fetchMock.mockResolvedValue(minted("token-1"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("token-1");
    await expect(getSessionToken()).resolves.toBe("token-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      deviceId: DEVICE,
      fingerprint: FINGERPRINT,
    });
  });

  it("mints again over a stored token that names no device", async () => {
    const store = stubStorage();
    store.set(
      "graspy.session",
      JSON.stringify({ token: "old", expiresAt: Date.now() + 3_600_000 }),
    );
    fetchMock.mockResolvedValue(minted("token-2"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("token-2");
  });

  it("shares one handshake between concurrent callers", async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(minted("token-1")), 10),
        ),
    );
    const { getSessionToken } = await loadSession();

    const tokens = await Promise.all([
      getSessionToken(),
      getSessionToken(),
      getSessionToken(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(["token-1", "token-1", "token-1"]);
  });

  it("mints again rather than serving a token near its expiry", async () => {
    fetchMock.mockResolvedValueOnce(minted("nearly-stale", 60));
    fetchMock.mockResolvedValueOnce(minted("token-2", 3600));
    const { getSessionToken } = await loadSession();

    await getSessionToken();

    await expect(getSessionToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getSessionToken when things fail", () => {
  it.each([
    [
      "issuance fails",
      () =>
        fetchMock.mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({}),
        }),
    ],
    [
      "the network refuses",
      () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch")),
    ],
    ["the token is empty", () => fetchMock.mockResolvedValue(minted(""))],
  ])("raises ApiError when %s", async (_, arrange) => {
    arrange();
    const { getSessionToken, ApiError } = await loadSession();

    await expect(getSessionToken()).rejects.toBeInstanceOf(ApiError);
  });

  it("works when private browsing denies sessionStorage", async () => {
    const denied = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: denied,
        setItem: denied,
        removeItem: () => {},
      },
    });
    fetchMock.mockResolvedValue(minted("token-1"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("token-1");
  });
});

describe("fetchWithSession", () => {
  it("attaches the token and keeps the caller's Headers instance", async () => {
    fetchMock.mockResolvedValueOnce(minted("token-1"));
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const { fetchWithSession } = await loadSession();

    await fetchWithSession("/mcp", {
      headers: new Headers({ "mcp-protocol-version": "2025-11-25" }),
    });

    const headers = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(headers.get("mcp-protocol-version")).toBe("2025-11-25");
    expect(headers.get("Authorization")).toBe("Bearer token-1");
  });

  it("re-mints and retries once when the server rejects the token", async () => {
    fetchMock
      .mockResolvedValueOnce(minted("stale"))
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce(minted("fresh"))
      .mockResolvedValueOnce({ ok: false, status: 401 });
    const { fetchWithSession } = await loadSession();

    const response = await fetchWithSession("/api/thing");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, retry] = fetchMock.mock.calls[3];
    expect(new Headers(retry.headers).get("Authorization")).toBe(
      "Bearer fresh",
    );
  });

  it("passes other failures straight back", async () => {
    fetchMock
      .mockResolvedValueOnce(minted("token-1"))
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const { fetchWithSession } = await loadSession();

    const response = await fetchWithSession("/api/thing");

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const sentBody = (call: number) =>
  JSON.parse(fetchMock.mock.calls[call][1].body);

describe("a signed-in learner's session", () => {
  it("names the account with a Firebase ID token", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockResolvedValue("id-token");
    fetchMock.mockResolvedValue(minted("account-token"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("account-token");

    expect(sentBody(0)).toEqual({
      deviceId: DEVICE,
      firebaseIdToken: "id-token",
    });
    expect(googleIdToken).toHaveBeenCalledWith(false);
  });

  it("re-mints with a fresh ID token when the server refuses one", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockImplementation(async (fresh) =>
      fresh ? "fresh" : "stale",
    );
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(minted("account-token"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("account-token");

    expect(sentBody(1)).toEqual({ deviceId: DEVICE, firebaseIdToken: "fresh" });
  });

  it("re-mints for the account, not the device, when a request is refused", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockResolvedValue("id-token");
    fetchMock
      .mockResolvedValueOnce(minted("first"))
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce(minted("second"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const { fetchWithSession } = await loadSession();

    await fetchWithSession("/api/thing");

    expect(sentBody(2)).toEqual({
      deviceId: DEVICE,
      firebaseIdToken: "id-token",
    });
  });

  it("signs out and names the device once Firebase no longer holds the sign-in", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockResolvedValue(null);
    fetchMock.mockResolvedValue(minted("device-token"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("device-token");

    expect(setAccount).toHaveBeenCalledWith(null);
    expect(sentBody(0)).toEqual({ deviceId: DEVICE, fingerprint: FINGERPRINT });
  });

  it("fails rather than naming the device when Firebase cannot be reached", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockRejectedValue(new Error("auth/network-request-failed"));
    const { getSessionToken, ApiError } = await loadSession();

    await expect(getSessionToken()).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setAccount).not.toHaveBeenCalled();
  });
});

describe("signing in and out", () => {
  it("replaces the device's token with the account's", async () => {
    fetchMock
      .mockResolvedValueOnce(minted("device-token"))
      .mockResolvedValueOnce(minted("account-token"));
    const { getSessionToken, startAccountSession } = await loadSession();
    await getSessionToken();

    await startAccountSession("id-token", ACCOUNT);

    expect(setAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(sentBody(1)).toEqual({
      deviceId: DEVICE,
      firebaseIdToken: "id-token",
    });
    await expect(getSessionToken()).resolves.toBe("account-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stays signed out when the server refuses the sign-in", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: { code: "sign_in_invalid" } }),
    });
    const { startAccountSession, ApiError } = await loadSession();

    await expect(
      startAccountSession("id-token", ACCOUNT),
    ).rejects.toBeInstanceOf(ApiError);

    expect(setAccount).not.toHaveBeenCalled();
  });

  it("goes back to the device's session on signing out", async () => {
    googleIdToken.mockResolvedValue("id-token");
    fetchMock
      .mockResolvedValueOnce(minted("account-token"))
      .mockResolvedValueOnce(minted("device-token"));
    const { endAccountSession, getSessionToken, startAccountSession } =
      await loadSession();
    await startAccountSession("id-token", ACCOUNT);

    endAccountSession();

    expect(signedIn).toBeNull();
    await expect(getSessionToken()).resolves.toBe("device-token");
    expect(sentBody(1)).toEqual({ deviceId: DEVICE, fingerprint: FINGERPRINT });
  });

  it("does not serve a token kept for someone signed in before", async () => {
    const store = stubStorage();
    store.set(
      "graspy.session",
      JSON.stringify({
        token: "account-token",
        device: DEVICE,
        account: "uid-1",
        expiresAt: Date.now() + 3_600_000,
      }),
    );
    fetchMock.mockResolvedValue(minted("device-token"));
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("device-token");
  });
});
