import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signOutTv } from "./tv-link-api";

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
