import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, UNREADABLE_ANSWER } from "./errors";
import { LearnerChanged } from "@/lib/learner-pin";
import { getJson, sendJson } from "./request";

const { fetchWithSession } = vi.hoisted(() => ({
  fetchWithSession:
    vi.fn<
      (
        url: string,
        init?: RequestInit,
        still?: () => boolean,
      ) => Promise<Response>
    >(),
}));
vi.mock("./session", () => ({ fetchWithSession }));

async function settled<T>(pending: Promise<T>) {
  const outcome = pending.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return outcome;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchWithSession.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("getJson when the session fails", () => {
  it("tries once a session graspy refused", async () => {
    const refused = new ApiError("refused", 403);
    fetchWithSession.mockRejectedValue(refused);

    expect(await settled(getJson("/thing"))).toEqual({ error: refused });
    expect(fetchWithSession).toHaveBeenCalledTimes(1);
  });

  it("tries again a session that could not reach graspy", async () => {
    fetchWithSession
      .mockRejectedValueOnce(new NetworkError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));

    expect(await settled(getJson("/thing"))).toEqual({ value: { ok: 1 } });
    expect(fetchWithSession).toHaveBeenCalledTimes(3);
  });

  it("gives up after three tries while graspy cannot be reached", async () => {
    fetchWithSession.mockRejectedValue(new NetworkError("Failed to fetch"));

    const { error } = (await settled(getJson("/thing"))) as { error: unknown };

    expect(error).toBeInstanceOf(NetworkError);
    expect(fetchWithSession).toHaveBeenCalledTimes(3);
  });
});

describe("getJson when the answer cannot be read", () => {
  it("takes a body that is not JSON as a 502, tried again", async () => {
    fetchWithSession.mockImplementation(
      async () => new Response("<html>Bad gateway</html>", { status: 200 }),
    );

    const { error } = (await settled(getJson("/thing"))) as { error: unknown };

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: UNREADABLE_ANSWER });
    expect(fetchWithSession).toHaveBeenCalledTimes(3);
  });

  it("takes a body cut off while it was read as a NetworkError", async () => {
    fetchWithSession.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => {
        throw new TypeError("network error");
      },
    } as unknown as Response);

    const { error } = (await settled(getJson("/thing"))) as { error: unknown };

    expect(error).toBeInstanceOf(NetworkError);
  });
});

describe("a request made for one learner", () => {
  const still = () => true;

  it("is sent only while the session is still theirs", async () => {
    fetchWithSession.mockResolvedValue(Response.json({ ok: 1 }));

    await settled(getJson("/thing", still));
    await settled(sendJson("/thing", "PUT", { a: 1 }, still));

    expect(fetchWithSession.mock.calls.map(([, , sent]) => sent)).toEqual([
      still,
      still,
    ]);
  });

  it("is not tried again once the device learns as someone else", async () => {
    const changed = new LearnerChanged();
    fetchWithSession
      .mockRejectedValueOnce(new NetworkError("Failed to fetch"))
      .mockRejectedValue(changed);

    expect(await settled(getJson("/thing", still))).toEqual({ error: changed });
    expect(fetchWithSession).toHaveBeenCalledTimes(2);
  });

  it("passes the learner changing back as it is, not as the network failing", async () => {
    const changed = new LearnerChanged();
    fetchWithSession.mockRejectedValue(changed);

    expect(await settled(sendJson("/thing", "POST", {}, still))).toEqual({
      error: changed,
    });
  });
});

describe("getJson with a signal", () => {
  it("does not try again once the signal is aborted", async () => {
    const controller = new AbortController();
    fetchWithSession.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new NetworkError("aborted"));
    });

    const outcome = await settled(
      getJson("/thing", undefined, controller.signal),
    );

    expect(outcome).toHaveProperty("error");
    expect(fetchWithSession).toHaveBeenCalledTimes(1);
    expect(fetchWithSession.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe("getJson's time limit", () => {
  it("cuts a try off when thirty seconds pass with no answer, and tries again", async () => {
    const signals: AbortSignal[] = [];
    fetchWithSession
      .mockImplementationOnce(async (_url, init) => {
        signals.push(init!.signal!);
        return new Promise<Response>(() => undefined);
      })
      .mockResolvedValueOnce(Response.json({ ok: 1 }));

    const pending = getJson<{ ok: number }>("/thing");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signals[0]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[0]!.reason).toMatchObject({ name: "TimeoutError" });
    // The first try never settles, as a hung request does; the limit ends the wait for it.
    expect(fetchWithSession).toHaveBeenCalledTimes(1);
    pending.catch(() => undefined);
  });

  it("lets a body that is slow to arrive finish once the headers are in, without a second request", async () => {
    const signals: AbortSignal[] = [];
    fetchWithSession.mockImplementation(async (_url, init) => {
      signals.push(init!.signal!);
      return {
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('{"ok":1}'), 90_000),
          ),
      } as unknown as Response;
    });

    const outcome = await settled(getJson("/thing"));

    expect(outcome).toEqual({ value: { ok: 1 } });
    expect(fetchWithSession).toHaveBeenCalledTimes(1);
    expect(signals[0]!.aborted).toBe(false);
  });

  it("tries again a read the limit cut off", async () => {
    fetchWithSession
      .mockRejectedValueOnce(
        new DOMException("The operation timed out.", "TimeoutError"),
      )
      .mockResolvedValueOnce(Response.json({ ok: 1 }));

    expect(await settled(getJson("/thing"))).toEqual({ value: { ok: 1 } });
    expect(fetchWithSession).toHaveBeenCalledTimes(2);
  });

  it("sends a write once, whatever the wait", async () => {
    fetchWithSession.mockRejectedValue(new NetworkError("Failed to fetch"));

    await settled(sendJson("/thing", "PUT", { a: 1 }));

    expect(fetchWithSession).toHaveBeenCalledTimes(1);
  });
});
