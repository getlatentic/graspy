import { afterEach, describe, expect, it, vi } from "vitest";
import { schoolSystems } from "./education-api";

const NG = [{ id: "NG", country: "NG", name: { en: "Nigeria" }, main: true, stages: [], levels: [] }];

function respond(body: unknown, type = "application/json", ok = true) {
  return { ok, headers: { get: () => type }, json: async () => body } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("the school systems of a country", () => {
  it("are read from the app's own host, and the API is not asked", async () => {
    const fetched = vi.fn(async () => respond(NG));
    vi.stubGlobal("fetch", fetched);

    await expect(schoolSystems("NG")).resolves.toEqual(NG);

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched).toHaveBeenCalledWith("/education/countries/NG.json");
  });

  it("are asked of the API when the file is missing, even when the host answers with its own page", async () => {
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(respond("<html>", "text/html"))
      .mockResolvedValueOnce(respond(NG));
    vi.stubGlobal("fetch", fetched);

    await expect(schoolSystems("NG")).resolves.toEqual(NG);

    expect(String(fetched.mock.calls[1][0])).toContain("/education/countries/NG");
  });

  it("are asked of the API when the file cannot be fetched or is not a list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(respond(NG)));
    await expect(schoolSystems("NG")).resolves.toEqual(NG);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respond({ not: "a list" })).mockResolvedValueOnce(respond(NG)));
    await expect(schoolSystems("NG")).resolves.toEqual(NG);
  });
});
