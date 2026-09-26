import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const FINGERPRINT = "ffeeddccbbaa99887766554433221100";
let device = DEVICE;
vi.mock("@/lib/device-id", () => ({
  deviceId: () => device,
  fingerprint: async () => FINGERPRINT,
}));

interface Signed {
  uid: string;
  name: string;
  email: string;
  learner: { id: string; name: string } | null;
  deviceJoins: boolean;
}
const IDENTITY = {
  uid: "uid-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
};
const ACCOUNT: Signed = { ...IDENTITY, learner: null, deviceJoins: true };
const ADA = { id: "a1b2c3d4e5f6", name: "Ada" };
const LEARNING: Signed = { ...ACCOUNT, learner: ADA, deviceJoins: false };
let signedIn: Signed | null = null;
const setAccount = vi.fn((account: Signed | null) => {
  signedIn = account;
});
const setLearner = vi.fn((learner: Signed["learner"]) => {
  if (signedIn) signedIn = { ...signedIn, learner };
});
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  setAccount,
  setLearner,
}));
const googleIdToken = vi.fn<(fresh: boolean) => Promise<string | null>>();
const wipeDevice = vi.fn(async () => undefined);
vi.mock("@/lib/device-wipe", () => ({ wipeDevice }));
const assign = vi.fn();
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));

// Fresh per test: the module holds the tab's token, and ApiError must come from
// the same reloaded graph for `instanceof` to hold.
async function loadSession() {
  vi.resetModules();
  const [session, errors] = await Promise.all([
    import("./session"),
    import("./errors"),
  ]);
  return {
    ...session,
    ApiError: errors.ApiError,
    NetworkError: errors.NetworkError,
    UNREADABLE_ANSWER: errors.UNREADABLE_ANSWER,
  };
}

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { assign },
  });
  return store;
}

function minted(token: string, expiresIn = 3600, extra: object = {}) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ token, expiresIn, ...extra }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  signedIn = null;
  device = DEVICE;
  setAccount.mockClear();
  setLearner.mockClear();
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

  it("signs out, wipes the device and starts again once Firebase no longer holds the sign-in", async () => {
    signedIn = LEARNING;
    googleIdToken.mockResolvedValue(null);
    const { getSessionToken, ApiError } = await loadSession();

    await expect(getSessionToken()).rejects.toBeInstanceOf(ApiError);

    expect(setAccount).toHaveBeenCalledWith(null);
    expect(wipeDevice).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails rather than naming the device when Firebase cannot be reached", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockRejectedValue(
      firebaseError("auth/network-request-failed"),
    );
    const { getSessionToken, NetworkError } = await loadSession();

    await expect(getSessionToken()).rejects.toBeInstanceOf(NetworkError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setAccount).not.toHaveBeenCalled();
  });
});

function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), {
    name: "FirebaseError",
    code,
  });
}

describe("a session exchange", () => {
  it.each([
    [
      "graspy cannot be reached",
      () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch")),
    ],
    [
      "the connection is cut while graspy's session is read",
      () =>
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => {
            throw new TypeError("network error");
          },
        }),
    ],
    [
      "Google cannot be reached",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockRejectedValue(
          firebaseError("auth/network-request-failed"),
        );
      },
    ],
    [
      "the Google sign-in module cannot be loaded",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockRejectedValue(
          new TypeError("Failed to fetch dynamically imported module"),
        );
      },
    ],
  ])("is unreachable when %s", async (_, arrange) => {
    arrange();
    const { getSessionToken, NetworkError } = await loadSession();

    await expect(getSessionToken()).rejects.toBeInstanceOf(NetworkError);
  });

  it.each([
    [
      "graspy refuses the session",
      () =>
        fetchMock.mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: "refused" }),
        }),
    ],
    [
      "graspy issues an empty session",
      () => fetchMock.mockResolvedValue(minted("")),
    ],
    [
      "graspy's JSON answer, read whole, is not a session",
      () =>
        fetchMock.mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
    ],
    [
      "Google refuses the sign-in",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockRejectedValue(
          firebaseError("auth/user-token-expired"),
        );
      },
    ],
  ])("is an answer when %s", async (_, arrange) => {
    arrange();
    const { getSessionToken, ApiError, NetworkError } = await loadSession();

    const failure = await getSessionToken().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(NetworkError);
    expect((failure as { retryable: boolean }).retryable).toBe(false);
  });

  it("is an answer the app cannot read, tried again later, when graspy's is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Welcome</html>", { status: 200 }),
    );
    const { getSessionToken, NetworkError, UNREADABLE_ANSWER } =
      await loadSession();

    const failure = await getSessionToken().catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(NetworkError);
    expect(failure).toMatchObject({
      status: UNREADABLE_ANSWER,
      retryable: true,
    });
  });

  it.each([
    [
      "graspy could not check the sign-in with Google",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockResolvedValue("id-token");
        fetchMock.mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({ detail: { code: "sign_in_unchecked" } }),
        });
      },
    ],
    [
      "Firebase is asked too often",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockRejectedValue(
          firebaseError("auth/too-many-requests"),
        );
      },
    ],
    [
      "Firebase fails on its side",
      () => {
        signedIn = ACCOUNT;
        googleIdToken.mockRejectedValue(firebaseError("auth/internal-error"));
      },
    ],
  ])("is a failure a later try may pass when %s", async (_, arrange) => {
    arrange();
    const { getSessionToken, ApiError, NetworkError } = await loadSession();

    const failure = await getSessionToken().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(NetworkError);
    expect((failure as { retryable: boolean }).retryable).toBe(true);
  });
});

describe("signing in and out", () => {
  it("replaces the device's token with the account's", async () => {
    fetchMock
      .mockResolvedValueOnce(minted("device-token"))
      .mockResolvedValueOnce(minted("account-token"));
    const { getSessionToken, startAccountSession } = await loadSession();
    await getSessionToken();

    await startAccountSession("id-token", IDENTITY);

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
      startAccountSession("id-token", IDENTITY),
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
    await startAccountSession("id-token", IDENTITY);

    endAccountSession();

    expect(signedIn).toBeNull();
    await expect(getSessionToken()).resolves.toBe("device-token");
    expect(sentBody(1)).toEqual({ deviceId: DEVICE, fingerprint: FINGERPRINT });
  });

  it("does not serve a token naming the device before it took a new id", async () => {
    fetchMock.mockResolvedValue(minted("old-device-token"));
    const { getSessionToken } = await loadSession();
    await getSessionToken();
    device = "fffffffffffffffffffffffffffffff0";
    fetchMock.mockResolvedValue(minted("new-device-token"));

    await expect(getSessionToken()).resolves.toBe("new-device-token");
    expect(sentBody(1)).toMatchObject({ deviceId: device });
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

describe("the learner a signed-in device learns as", () => {
  it("is named in every exchange of the ID token", async () => {
    signedIn = LEARNING;
    googleIdToken.mockResolvedValue("id-token");
    fetchMock.mockResolvedValue(
      minted("learner-token", 3600, { signedIn: true, learner: ADA }),
    );
    const { getSessionToken } = await loadSession();

    await expect(getSessionToken()).resolves.toBe("learner-token");

    expect(sentBody(0)).toEqual({
      deviceId: DEVICE,
      firebaseIdToken: "id-token",
      learnerId: ADA.id,
    });
    expect(setLearner).not.toHaveBeenCalled();
  });

  it("is let go when the account no longer holds them", async () => {
    signedIn = LEARNING;
    googleIdToken.mockResolvedValue("id-token");
    fetchMock.mockResolvedValue(
      minted("account-token", 3600, { signedIn: true, learner: null }),
    );
    const { getSessionToken } = await loadSession();

    await getSessionToken();

    expect(setLearner).toHaveBeenCalledWith(null);
    expect(signedIn?.learner).toBeNull();
  });

  it("takes a new name given on another device", async () => {
    signedIn = LEARNING;
    googleIdToken.mockResolvedValue("id-token");
    const renamed = { ...ADA, name: "Ada L.", createdAt: 1 };
    fetchMock.mockResolvedValue(
      minted("learner-token", 3600, { signedIn: true, learner: renamed }),
    );
    const { getSessionToken } = await loadSession();

    await getSessionToken();

    expect(setLearner).toHaveBeenCalledWith({ id: ADA.id, name: "Ada L." });
  });

  it("is kept with the session the server issued for them", async () => {
    signedIn = ACCOUNT;
    const { getSessionToken, keepLearnerSession } = await loadSession();

    keepLearnerSession({ token: "ada-token", expiresIn: 3600, learner: ADA });

    expect(signedIn?.learner).toEqual(ADA);
    await expect(getSessionToken()).resolves.toBe("ada-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not share a token with another learner of the account", async () => {
    signedIn = ACCOUNT;
    googleIdToken.mockResolvedValue("id-token");
    fetchMock.mockResolvedValue(
      minted("grace-token", 3600, { learner: { id: "grace", name: "Grace" } }),
    );
    const { getSessionToken, keepLearnerSession } = await loadSession();
    keepLearnerSession({ token: "ada-token", expiresIn: 3600, learner: ADA });

    signedIn = { ...LEARNING, learner: { id: "grace", name: "Grace" } };

    await expect(getSessionToken()).resolves.toBe("grace-token");
  });

  it("is none once the device leaves them, with the account kept", async () => {
    signedIn = LEARNING;
    const { leaveLearnerSession } = await loadSession();

    leaveLearnerSession();

    expect(setLearner).toHaveBeenCalledWith(null);
    expect(signedIn?.uid).toBe(IDENTITY.uid);
  });
});
