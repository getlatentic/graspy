import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const FINGERPRINT = "ffeeddccbbaa99887766554433221100";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => FINGERPRINT,
}));

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
