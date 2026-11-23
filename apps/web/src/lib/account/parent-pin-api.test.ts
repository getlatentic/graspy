import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import corpus from "../../../../../tests/fixtures/weak-pins.json";

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
    await api.verifyPin("482915");

    expect(askForParentSession).toHaveBeenCalledWith(
      "/account/parent-pin/verify",
      "POST",
      { pin: "482915" },
    );
  });

  it("send a new PIN with a Google sign-in just made, or with the one it replaces", async () => {
    await api.savePin("264819", { firebaseIdToken: "fresh" });
    await api.savePin("264819", { currentPin: "482915" });

    expect(askForParentSession.mock.calls).toEqual([
      [
        "/account/parent-pin",
        "PUT",
        { pin: "264819", firebaseIdToken: "fresh" },
      ],
      ["/account/parent-pin", "PUT", { pin: "264819", currentPin: "482915" }],
    ]);
  });

  it("never put the PIN in an address", async () => {
    await api.verifyPin("482915");
    await api.savePin("264819", { currentPin: "482915" });

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

describe("the PINs a person tries first", () => {
  it.each(corpus.weak)("are refused: %s", (pin) => {
    expect(api.tooEasy(pin)).toBe(true);
  });

  it.each(corpus.fine)("are not refused: %s", (pin) => {
    expect(api.tooEasy(pin)).toBe(false);
  });

  it("are the server's own list, which reads the same file", () => {
    expect(corpus.weak.length).toBeGreaterThan(100);
  });
});

describe("the length of a PIN", () => {
  it("is six to eight digits, six by default", () => {
    expect([
      api.MIN_PIN_LENGTH,
      api.DEFAULT_PIN_LENGTH,
      api.MAX_PIN_LENGTH,
    ]).toEqual([6, 6, 8]);
  });
});
