import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "./errors";
import { getJson } from "./request";

const { fetchWithSession } = vi.hoisted(() => ({
  fetchWithSession: vi.fn<(url: string) => Promise<Response>>(),
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
