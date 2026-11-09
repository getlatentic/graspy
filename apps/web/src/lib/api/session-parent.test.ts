import { beforeEach, describe, expect, it, vi } from "vitest";

const DEVICE = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
vi.mock("@/lib/device-id", () => ({
  deviceId: () => DEVICE,
  fingerprint: async () => null,
}));

const ADA = { id: "a1b2c3d4e5f6", name: "Ada" };
let signedIn: object | null = null;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  setAccount: vi.fn(),
  setLearner: vi.fn(),
}));
const googleIdToken = vi.fn<(fresh: boolean) => Promise<string | null>>();
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));
vi.mock("@/lib/device-wipe", () => ({ wipeDevice: async () => undefined }));

const fetchMock = vi.fn();

function answer(status: number, body: object = {}) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
}

const minted = (token: string) => answer(200, { token, expiresIn: 3600 });

async function load() {
  vi.resetModules();
  return import("./session");
}

function bodyOf(call: number) {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  googleIdToken.mockReset();
  googleIdToken.mockResolvedValue("id-token");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
  signedIn = {
    uid: "uid-1",
    name: "Ada",
    email: "a@example.com",
    learner: ADA,
    deviceJoins: false,
  };
});

describe("fetchAsParent", () => {
  it("asks for the account's session with no learner, though a learner is in use", async () => {
    fetchMock.mockResolvedValueOnce(minted("parent-token"));
    fetchMock.mockResolvedValueOnce(answer(204));
    const { fetchAsParent } = await load();

    await fetchAsParent("/api/account/learners/x/voice");

    expect(bodyOf(0)).toEqual({
      deviceId: DEVICE,
      firebaseIdToken: "id-token",
    });
    expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer parent-token",
    );
  });

  it("keeps the parent's token for later calls", async () => {
    fetchMock.mockResolvedValueOnce(minted("parent-token"));
    fetchMock.mockResolvedValue(answer(204));
    const { fetchAsParent } = await load();

    await fetchAsParent("/a");
    await fetchAsParent("/b");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("/session"),
      "/a",
      "/b",
    ]);
  });

  it("makes a new session once when the server refuses the token", async () => {
    fetchMock
      .mockResolvedValueOnce(minted("old"))
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(minted("new"))
      .mockResolvedValueOnce(answer(204));
    const { fetchAsParent } = await load();

    const response = await fetchAsParent("/a");

    expect(response.status).toBe(204);
    expect(fetchMock.mock.calls[3][1].headers.get("Authorization")).toBe(
      "Bearer new",
    );
  });

  it("is a different session after the account signs out", async () => {
    fetchMock.mockResolvedValue(minted("parent-token"));
    const { fetchAsParent, endAccountSession } = await load();
    await fetchAsParent("/a");

    endAccountSession();
    signedIn = null;

    await expect(fetchAsParent("/b")).rejects.toThrow("Sign in first");
  });
});
