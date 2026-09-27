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
