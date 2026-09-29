import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithSession = vi.fn();
vi.mock("@/lib/api/session", () => ({ fetchWithSession }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const { call, refusalCode } = await import("./account-call");

beforeEach(() => fetchWithSession.mockReset());

describe("a call to the account's routes", () => {
  it("sends a body as JSON", async () => {
    fetchWithSession.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ done: true }),
    });

    await expect(call("https://api.test/x", "PUT", { a: 1 })).resolves.toEqual({
      done: true,
    });

    const [, init] = fetchWithSession.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it("answers nothing to a 204", async () => {
    fetchWithSession.mockResolvedValue({ ok: true, status: 204 });

    await expect(call("https://api.test/x", "DELETE")).resolves.toBeUndefined();
  });

  it("fails with the server's refusal", async () => {
    fetchWithSession.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: { error: "Stale", code: "sign_in_stale" } }),
    });

    const refused = await call("https://api.test/x", "PUT", {}).catch(
      (error: unknown) => error,
    );

    expect(refused).toMatchObject({ status: 401 });
    expect(refusalCode(refused)).toBe("sign_in_stale");
  });

  it("fails as a network error when nothing answers", async () => {
    fetchWithSession.mockRejectedValueOnce(new TypeError("offline"));

    const failed = await call("https://api.test/x", "GET").catch(
      (error: unknown) => error,
    );

    expect(failed).toHaveProperty("status", 0);
  });
});

describe("refusalCode", () => {
  it("reads the server's code from a refusal", () => {
    const refused = { data: { detail: { code: "too_many_learners" } } };

    expect(refusalCode(refused)).toBe("too_many_learners");
    expect(refusalCode(new Error("offline"))).toBeNull();
    expect(refusalCode(null)).toBeNull();
  });
});
