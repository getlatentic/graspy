// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// What this file keeps real: sign-in.ts, the session module and the account store, so that the
// order of the two calls, and the token they share, are what the code does and not what a mock
// says. Only Google, the device's identity and the network are faked.
const google = {
  prepareGoogle: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn(async () => ({
    account: { uid: "uid-1", name: "Ada", email: "ada@example.com" },
    idToken: "google-id-token",
  })),
  reauthenticateWithGoogle: vi.fn(async () => "fresh-google-id-token"),
  signOutOfGoogle: vi.fn(async () => undefined),
  googleIdToken: vi.fn(async () => "google-id-token"),
};
vi.mock("./google-auth", () => google);
vi.mock("@/lib/device-id", () => ({
  deviceId: () => "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  fingerprint: async () => null,
  newDeviceId: () => "ffeeddccbbaa99887766554433221100",
}));
vi.mock("@/lib/device-wipe", () => ({
  wipeDevice: vi.fn(async () => undefined),
}));
vi.mock("@/lib/warm-api", () => ({ warmApi: vi.fn() }));

const answer = (body: object) =>
  new Response(JSON.stringify(body), { status: 200 });

let calls: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/account/parent-session")
        ? answer({ token: "parent-token", expiresIn: 900, signedIn: true })
        : answer({ token: "session-token", expiresIn: 3600, signedIn: true });
    }),
  );
});

describe("the one sign-in of a parent, with the real session code", () => {
  it("makes the account's session and then the parent's from one Google token, with exactly two calls", async () => {
    const { signInAsParent } = await import("./sign-in");
    const { hasParentSession } = await import("@/lib/api/session");

    await signInAsParent();

    expect(google.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(google.reauthenticateWithGoogle).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    const [first, second] = calls;
    expect(first.url).toMatch(/\/session$/);
    expect(JSON.parse(String(first.init.body))).toMatchObject({
      firebaseIdToken: "google-id-token",
    });
    expect(second.url).toMatch(/\/account\/parent-session$/);
    expect(JSON.parse(String(second.init.body))).toEqual({
      firebaseIdToken: "google-id-token",
    });
    expect(new Headers(second.init.headers).get("Authorization")).toBe(
      "Bearer session-token",
    );
    expect(hasParentSession()).toBe(true);
  });

  it("leaves the account signed in, with no learner chosen, as an ordinary sign-in does", async () => {
    const { signInAsParent } = await import("./sign-in");
    const { currentAccount } = await import("./account-store");

    await signInAsParent();

    expect(currentAccount()).toMatchObject({
      uid: "uid-1",
      learner: null,
    });
  });

  it("makes the parent's session and no account session when the phone is already signed in", async () => {
    const { signInAsParent } = await import("./sign-in");
    const { setAccount } = await import("./account-store");
    const { startAccountSession, hasParentSession } =
      await import("@/lib/api/session");
    await startAccountSession("google-id-token", {
      uid: "uid-1",
      name: "Ada",
      email: "ada@example.com",
    });
    setAccount({
      uid: "uid-1",
      name: "Ada",
      email: "ada@example.com",
      learner: null,
      deviceJoins: true,
    });
    calls = [];

    await signInAsParent();

    expect(google.reauthenticateWithGoogle).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.url.split("/api/")[1])).toEqual([
      "account/parent-session",
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      firebaseIdToken: "fresh-google-id-token",
    });
    expect(hasParentSession()).toBe(true);
  });
});
