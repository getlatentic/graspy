import { beforeEach, describe, expect, it, vi } from "vitest";

const steps: string[] = [];
const user = {
  getIdToken: vi.fn(async (fresh?: boolean) => {
    steps.push(`token ${fresh}`);
    return fresh ? "fresh-token" : "old-token";
  }),
};
const auth: {
  currentUser: typeof user | null;
  authStateReady: () => Promise<void>;
} = { currentUser: user, authStateReady: async () => undefined };
const parameters: Record<string, string>[] = [];
const signInWithPopup = vi.fn(async () => ({ user }));
const reauthenticateWithPopup = vi.fn(async () => {
  steps.push("popup");
  return { user };
});

vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  browserPopupRedirectResolver: {},
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters(custom: Record<string, string>) {
      parameters.push(custom);
    }
  },
  indexedDBLocalPersistence: {},
  initializeAuth: () => auth,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  FIREBASE_CONFIG: { apiKey: "k", authDomain: "d", projectId: "p", appId: "a" },
  FIREBASE_AUTH_EMULATOR: null,
}));

const { reauthenticateWithGoogle, signInWithGoogle } =
  await import("./google-auth");

beforeEach(() => {
  steps.length = 0;
  parameters.length = 0;
  auth.currentUser = user;
  reauthenticateWithPopup.mockClear();
  user.getIdToken.mockClear();
});

describe("signing in again with Google", () => {
  it("opens Google's window for the user signed in, and asks for a token made after it", async () => {
    await expect(reauthenticateWithGoogle()).resolves.toBe("fresh-token");

    expect(reauthenticateWithPopup).toHaveBeenCalledWith(
      user,
      expect.anything(),
    );
    expect(steps).toEqual(["popup", "token true"]);
  });

  it("asks for the credentials again, whatever Google's window remembers, so one tap is not enough", async () => {
    await reauthenticateWithGoogle();

    expect(parameters).toEqual([{ prompt: "login", max_age: "0" }]);
  });

  it("fails when Firebase has nobody signed in", async () => {
    auth.currentUser = null;

    await expect(reauthenticateWithGoogle()).rejects.toMatchObject({
      code: "graspy/not-signed-in",
    });
    expect(reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it("gives no token when the parent closes the window", async () => {
    reauthenticateWithPopup.mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });

    await expect(reauthenticateWithGoogle()).rejects.toEqual({
      code: "auth/popup-closed-by-user",
    });
    expect(user.getIdToken).not.toHaveBeenCalled();
  });
});

describe("signing in with Google", () => {
  it("always has the account chosen, never a tap on whoever Google's window remembers", async () => {
    await signInWithGoogle();

    expect(parameters).toEqual([{ prompt: "select_account" }]);
  });

  it("asks for the credentials again when it is to make the parent", async () => {
    await signInWithGoogle(true);

    expect(parameters).toEqual([{ prompt: "login", max_age: "0" }]);
  });
});
