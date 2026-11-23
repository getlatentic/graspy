import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { continueTvLink, signOutTv } from "./tv-link-api";

vi.mock("@/lib/api/session", () => ({ fetchAsParent: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("signing a TV out", () => {
  it("sends the credential it holds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await signOutTv("credential");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/tv-sign-in\/sign-out$/);
    expect(JSON.parse(init.body)).toEqual({ refreshToken: "credential" });
  });

  it("gives up on a server that does not answer, so signing out does not hang", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    let outcome = "waiting";
    const signingOut = signOutTv("credential").then(
      () => (outcome = "done"),
      () => (outcome = "gave up"),
    );

    await vi.advanceTimersByTimeAsync(4_900);
    expect(outcome).toBe("waiting");
    await vi.advanceTimersByTimeAsync(200);
    await signingOut;

    expect(outcome).toBe("gave up");
  });
});

describe("signing a TV out, with the credential alone", () => {
  it("sends no session, no Authorization and no cookie: the credential is the whole proof", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await signOutTv("credential");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      refreshToken: "credential",
    });
  });
});

describe("asking for the session", () => {
  function hungFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
  }

  it("gives up on a server that hangs after fifteen seconds, so the screen can end in a defined state", async () => {
    hungFetch();
    let outcome = "waiting";
    const asking = continueTvLink("device-code").then(
      () => (outcome = "answered"),
      () => (outcome = "gave up"),
    );

    await vi.advanceTimersByTimeAsync(14_900);
    expect(outcome).toBe("waiting");
    await vi.advanceTimersByTimeAsync(200);
    await asking;

    expect(outcome).toBe("gave up");
  });

  it("answers as soon as the server does, and leaves no timer behind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "full" }), { status: 200 }),
      ),
    );

    await expect(continueTvLink("device-code")).resolves.toEqual({
      status: "full",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is given up on when the caller's own signal aborts", async () => {
    hungFetch();
    const controller = new AbortController();
    const asking = continueTvLink("device-code", controller.signal);
    const outcome = asking.then(
      () => "answered",
      () => "gave up",
    );

    controller.abort();

    await expect(outcome).resolves.toBe("gave up");
  });
});
