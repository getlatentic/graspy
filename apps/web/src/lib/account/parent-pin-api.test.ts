import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const fetchWithSession = vi.fn();
const askForParentSession = vi.fn();
vi.mock("@/lib/api/session", () => ({ fetchWithSession, askForParentSession }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const api = await import("./parent-pin-api");

const refusal = (status: number, detail: object) =>
  new ApiError("refused", status, { detail });

beforeEach(() => {
  fetchWithSession.mockReset();
  askForParentSession.mockReset().mockResolvedValue(undefined);
});

describe("the parent PIN's calls", () => {
  it("ask the account whether there is one, under the session in use", async () => {
    fetchWithSession.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hasPin: true, length: 6, lockedUntil: null }),
    });

    await expect(api.getPinStatus()).resolves.toEqual({
      hasPin: true,
      length: 6,
      lockedUntil: null,
    });
    expect(fetchWithSession.mock.calls[0][0]).toBe(
      "https://api.test/api/account/parent-pin",
    );
  });

  it("send the PIN typed in the body of one call that makes the parent's session", async () => {
    await api.verifyPin("4827");

    expect(askForParentSession).toHaveBeenCalledWith(
      "/account/parent-pin/verify",
      "POST",
      { pin: "4827" },
    );
  });

  it("send a new PIN with a Google sign-in just made, or with the one it replaces", async () => {
    await api.savePin("7391", { firebaseIdToken: "fresh" });
    await api.savePin("7391", { currentPin: "4827" });

    expect(askForParentSession.mock.calls).toEqual([
      ["/account/parent-pin", "PUT", { pin: "7391", firebaseIdToken: "fresh" }],
      ["/account/parent-pin", "PUT", { pin: "7391", currentPin: "4827" }],
    ]);
  });

  it("never put the PIN in an address", async () => {
    await api.verifyPin("4827");
    await api.savePin("7391", { currentPin: "4827" });

    expect(
      JSON.stringify(askForParentSession.mock.calls.map((c) => c[0])),
    ).not.toMatch(/\d{4}/);
  });
});

describe("what the server says of a refused PIN", () => {
  it("is wrong, with the tries left", () => {
    expect(
      api.pinRefusalOf(refusal(403, { code: "pin_wrong", attemptsLeft: 3 })),
    ).toEqual({ kind: "wrong", attemptsLeft: 3 });
  });

  it("is locked until a time", () => {
    expect(
      api.pinRefusalOf(refusal(429, { code: "pin_locked", lockedUntil: 99 })),
    ).toEqual({ kind: "locked", until: 99 });
  });

  it("is not read as locked without a time", () => {
    expect(api.pinRefusalOf(refusal(429, { code: "pin_locked" }))).toBeNull();
  });

  it.each([
    ["pin_not_set", "notSet"],
    ["rate_limited", "busy"],
    ["pin_too_easy", "tooEasy"],
  ])("names %s", (code, kind) => {
    expect(api.pinRefusalOf(refusal(409, { code }))).toEqual({ kind });
  });

  it("is nothing for another refusal or for no refusal", () => {
    expect(api.pinRefusalOf(refusal(500, { code: "other" }))).toBeNull();
    expect(api.pinRefusalOf(new TypeError("Failed to fetch"))).toBeNull();
  });
});

describe("a PIN that is a run or a repeat", () => {
  it.each(["0000", "1111", "1234", "4321", "123456", "98765432", "99999999"])(
    "is too easy: %s",
    (pin) => expect(api.tooEasy(pin)).toBe(true),
  );

  it.each(["4827", "1235", "1243", "135790", "1212", "4829"])(
    "is not: %s",
    (pin) => expect(api.tooEasy(pin)).toBe(false),
  );

  it("is judged as the server judges it", () => {
    // The same cases as tests/test_parent_pin.py: the server refuses what the pad refuses.
    for (const easy of ["0000", "1111", "1234", "4321", "123456", "98765432"]) {
      expect(api.tooEasy(easy)).toBe(true);
    }
  });
});
