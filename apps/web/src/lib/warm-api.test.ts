import { afterEach, describe, expect, it, vi } from "vitest";
import { warmApi } from "./warm-api";

vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

describe("warmApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server's health check without using the cache", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    warmApi();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/health", {
      cache: "no-store",
    });
  });

  it("does not raise when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    expect(() => warmApi()).not.toThrow();
    await Promise.resolve();
  });
});
