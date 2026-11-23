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
    fetchMock.mockResolvedValueOnce(
      answer(401, { detail: { code: "session_invalid" } }),
    );

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

  it("keeps the session when a 401 is the request's own, such as a stale sign-in", async () => {
    const { fetchAsParent, hasParentSession } = await started();
    fetchMock.mockResolvedValueOnce(
      answer(401, { detail: { code: "sign_in_stale" } }),
    );

    const refused = await fetchAsParent("/a");

    expect(refused.status).toBe(401);
    expect(hasParentSession()).toBe(true);
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

  it("says when it ends, once there is one", async () => {
    const { parentSessionEnds } = await load();
    expect(parentSessionEnds()).toBeNull();

    const started_ = await started();
    const ends = started_.parentSessionEnds();

    expect(ends).toBeGreaterThan(Date.now() + 14 * 60 * 1000 - 60_000);
    expect(ends).toBeLessThan(Date.now() + 15 * 60 * 1000);
  });

  it("is not the next account's", async () => {
    const { hasParentSession, endAccountSession } = await started();

    endAccountSession();
    signedIn = { ...(signedIn as object), uid: "uid-2" };

    expect(hasParentSession()).toBe(false);
  });

  it("is made from a call that carries a proof, under the session in use, and kept for the account", async () => {
    fetchMock.mockResolvedValueOnce(minted("learner-token"));
    fetchMock.mockResolvedValueOnce(
      answer(200, { token: "pin-token", expiresIn: 900 }),
    );
    const session = await load();

    await session.askForParentSession("/account/parent-pin/verify", "POST", {
      pin: "4827",
    });

    expect(fetchMock.mock.calls[1][0]).toContain("/account/parent-pin/verify");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      pin: "4827",
    });
    expect(sentWith(1)).toBe("Bearer learner-token");
    expect(session.hasParentSession()).toBe(true);
  });

  it("is not made by a PIN the server refused, and the refusal is thrown as it came", async () => {
    fetchMock.mockResolvedValueOnce(minted("learner-token"));
    fetchMock.mockResolvedValueOnce(
      answer(403, { detail: { code: "pin_wrong", attemptsLeft: 4 } }),
    );
    const session = await load();

    const failure = await session
      .askForParentSession("/account/parent-pin/verify", "POST", {
        pin: "1357",
      })
      .catch((error: unknown) => error);

    expect((failure as { data: object }).data).toEqual({
      detail: { code: "pin_wrong", attemptsLeft: 4 },
    });
    expect(session.hasParentSession()).toBe(false);
  });

  it("tells what listens when it is made, refused by the server, and ended with the account", async () => {
    const session = await load();
    const heard = vi.fn();
    const stop = session.subscribeParentSession(heard);

    fetchMock.mockResolvedValueOnce(minted("learner-token"));
    fetchMock.mockResolvedValueOnce(
      answer(200, { token: "p", expiresIn: 900 }),
    );
    await session.startParentSession("fresh-id-token");
    expect(heard).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      answer(401, { detail: { code: "session_invalid" } }),
    );
    await session.fetchAsParent("/a").catch(() => undefined);
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    session.endAccountSession();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("is ended for the listeners when the account signs out", async () => {
    const session = await started();
    const heard = vi.fn();
    session.subscribeParentSession(heard);

    session.endAccountSession();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(session.hasParentSession()).toBe(false);
  });

  it("is told, by parentRefused, from any other failure", async () => {
    const { parentRefused, ParentSignInNeeded } = await load();

    expect(parentRefused(new ParentSignInNeeded())).toBe(true);
    expect(parentRefused(new Error("x"))).toBe(false);
  });
});
