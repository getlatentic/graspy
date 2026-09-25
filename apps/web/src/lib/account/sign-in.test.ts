import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = { uid: "uid-1", name: "Ada", email: "ada@example.com" };
const google = {
  prepareGoogle: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn(async () => ({ account: ACCOUNT, idToken: "id" })),
  signOutOfGoogle: vi.fn(async () => undefined),
};
vi.mock("./google-auth", () => google);
const session = {
  startAccountSession: vi.fn(async () => undefined),
  endAccountSession: vi.fn(),
};
vi.mock("@/lib/api/session", () => session);
const forgetPlanSync = vi.fn();
vi.mock("@/lib/plan-sync", () => ({ forgetPlanSync }));

const { signIn, signInProblem, signOut } = await import("./sign-in");

beforeEach(() => vi.clearAllMocks());

describe("signIn", () => {
  it("exchanges Google's ID token for the account's session", async () => {
    await signIn();

    expect(session.startAccountSession).toHaveBeenCalledWith("id", ACCOUNT);
  });

  it("signs out of Google when the server refuses the sign-in", async () => {
    session.startAccountSession.mockRejectedValueOnce(new Error("refused"));

    await expect(signIn()).rejects.toThrow("refused");

    expect(google.signOutOfGoogle).toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends the account's session and forgets what was synced", async () => {
    await signOut();

    expect(session.endAccountSession).toHaveBeenCalled();
    expect(forgetPlanSync).toHaveBeenCalled();
    expect(google.signOutOfGoogle).toHaveBeenCalled();
  });
});

describe("signInProblem", () => {
  it.each([
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/user-cancelled",
  ])("says nothing when the learner cancelled (%s)", (code) => {
    expect(signInProblem({ code })).toBeNull();
  });

  it("asks for pop-ups when the browser blocked the window", () => {
    expect(signInProblem({ code: "auth/popup-blocked" })).toBe("popupBlocked");
  });

  it.each([
    { code: "auth/network-request-failed" },
    new Error("sign_in_invalid"),
    null,
  ])("reports any other failure", (error) => {
    expect(signInProblem(error)).toBe("failed");
  });
});
