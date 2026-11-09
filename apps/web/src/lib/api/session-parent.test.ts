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
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

const minted = (token: string) => answer(200, { token, expiresIn: 3600 });

async function load() {
  vi.resetModules();
  return import("./session");
}

const sentWith = (call: number) =>
  fetchMock.mock.calls[call][1].headers.get("Authorization");

/** The session in use is minted, then the parent's session is asked for under it. */
async function started(token = "parent-token") {
  fetchMock.mockResolvedValueOnce(minted("learner-token"));
  fetchMock.mockResolvedValueOnce(answer(200, { token, expiresIn: 900 }));
  const session = await load();
  await session.startParentSession("fresh-id-token");
  return session;
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

describe("the parent's session", () => {
  it("is asked for with the Google sign-in just made, under the session in use", async () => {
    await started();

    expect(fetchMock.mock.calls[1][0]).toContain("/account/parent-session");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      firebaseIdToken: "fresh-id-token",
    });
    expect(sentWith(1)).toBe("Bearer learner-token");
  });

  it("is what recordings are fetched with, though a learner is in use", async () => {
    const { fetchAsParent, hasParentSession } = await started();
    fetchMock.mockResolvedValueOnce(answer(204));

    await fetchAsParent("/api/account/learners/x/voice");

    expect(hasParentSession()).toBe(true);
    expect(sentWith(2)).toBe("Bearer parent-token");
  });

  it("is never made on its own: without a sign-in again, nothing is sent", async () => {
    const { fetchAsParent, hasParentSession, ParentSignInNeeded } =
      await load();

    await expect(fetchAsParent("/a")).rejects.toBeInstanceOf(
      ParentSignInNeeded,
    );

    expect(hasParentSession()).toBe(false);
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is dropped when the server refuses it, and the parent is asked to sign in again", async () => {
    const { fetchAsParent, hasParentSession, ParentSignInNeeded } =
      await started();
    fetchMock.mockResolvedValueOnce(answer(401));

    await expect(fetchAsParent("/a")).rejects.toBeInstanceOf(
      ParentSignInNeeded,
    );

    expect(hasParentSession()).toBe(false);
  });

  it("is dropped when the server says the session is not the parent's", async () => {
    const { fetchAsParent, ParentSignInNeeded } = await started();
    fetchMock.mockResolvedValueOnce(
      answer(403, { detail: { code: "account_required" } }),
    );

    await expect(fetchAsParent("/a")).rejects.toBeInstanceOf(
      ParentSignInNeeded,
    );
  });

  it("passes another refusal on, and keeps the session", async () => {
    const { fetchAsParent, hasParentSession } = await started();
    fetchMock.mockResolvedValueOnce(
      answer(403, { detail: { code: "sign_in_other_account" } }),
    );

    const refused = await fetchAsParent("/a");

    expect(refused.status).toBe(403);
    expect(hasParentSession()).toBe(true);
  });

  it("lapses with the minutes the server gave it", async () => {
    const { hasParentSession } = await started();
    vi.useFakeTimers({ now: Date.now() + 15 * 60 * 1000 });

    expect(hasParentSession()).toBe(false);
    vi.useRealTimers();
  });

  it("is not the next account's", async () => {
    const { hasParentSession, endAccountSession } = await started();

    endAccountSession();
    signedIn = { ...(signedIn as object), uid: "uid-2" };

    expect(hasParentSession()).toBe(false);
  });
});
