import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = { uid: "uid-1", name: "Ada", email: "ada@example.com" };
const google = {
  prepareGoogle: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn(async () => ({ account: ACCOUNT, idToken: "id" })),
  signOutOfGoogle: vi.fn(async () => undefined),
  reauthenticateWithGoogle: vi.fn(async () => "fresh-id"),
};
vi.mock("./google-auth", () => google);
const session = {
  startAccountSession: vi.fn(async () => undefined),
  endAccountSession: vi.fn(),
};
vi.mock("@/lib/api/session", () => session);
const wipeDevice = vi.fn(async () => undefined);
vi.mock("@/lib/device-wipe", () => ({ wipeDevice }));
const deleteAccount = vi.fn(async () => undefined);
vi.mock("./learners-api", () => ({ deleteAccount }));

const { deleteAccountAndSignOut, signIn, signInAgain, signInProblem, signOut } =
  await import("./sign-in");

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

describe("signInAgain", () => {
  it("returns the token of a sign-in just made with Google, and starts no session", async () => {
    await expect(signInAgain()).resolves.toBe("fresh-id");

    expect(google.reauthenticateWithGoogle).toHaveBeenCalledTimes(1);
    expect(google.signInWithGoogle).not.toHaveBeenCalled();
    expect(session.startAccountSession).not.toHaveBeenCalled();
  });

  it("fails as Google does when the parent closes the window", async () => {
    google.reauthenticateWithGoogle.mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });

    await expect(signInAgain()).rejects.toEqual({
      code: "auth/popup-closed-by-user",
    });
  });
});

describe("signOut", () => {
  it("ends the account's session, wipes the device, and signs out of Google", async () => {
    await signOut();

    expect(session.endAccountSession).toHaveBeenCalled();
    expect(wipeDevice).toHaveBeenCalled();
    expect(google.signOutOfGoogle).toHaveBeenCalled();
  });
});

describe("deleteAccountAndSignOut", () => {
  it("deletes the account, then signs out", async () => {
    await deleteAccountAndSignOut();

    expect(deleteAccount).toHaveBeenCalled();
    expect(wipeDevice).toHaveBeenCalled();
  });

  it("stays signed in when the account could not be deleted", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("offline"));

    await expect(deleteAccountAndSignOut()).rejects.toThrow("offline");

    expect(wipeDevice).not.toHaveBeenCalled();
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
