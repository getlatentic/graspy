import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolSystem } from "./education-api";

const schoolSystems = vi.fn<(country: string) => Promise<SchoolSystem[]>>();
vi.mock("./education-api", () => ({ schoolSystems }));

const { placeEarlierClass } = await import("./earlier-class");
const { getUserProfile } = await import("./user-storage");

const KEY = "graspy_user_profile";
let store: Map<string, string>;

const SLOVAKIA: SchoolSystem = {
  id: "SK",
  country: "SK",
  name: { en: "Slovakia" },
  main: true,
  stages: [{ id: "stredna", name: { en: "Secondary school" } }],
  levels: [
    {
      id: "stredna-1",
      stage: "stredna",
      year: 10,
      name: {
        en: "Secondary Year 1",
        local: { sk: "1. ročník strednej školy" },
      },
      aliases: [],
      age: 15,
    },
  ],
};

beforeEach(() => {
  store = new Map();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  vi.stubGlobal("localStorage", localStorage);
  schoolSystems.mockReset().mockResolvedValue([SLOVAKIA]);
});

describe("a class chosen before the catalogue", () => {
  it("is placed on the country's class for its school year", async () => {
    store.set(
      KEY,
      JSON.stringify({
        country: "SK",
        language: "en",
        schoolGrade: "grade_10",
        gradeLevel: "1. ročník strednej školy",
      }),
    );

    expect(await placeEarlierClass()).toBe(true);
    expect(schoolSystems).toHaveBeenCalledWith("SK");
    const placed = getUserProfile();
    expect(placed).toMatchObject({
      system: "SK",
      level: "stredna-1",
      gradeLevel: "Secondary Year 1 (Secondary school), Slovakia, age 15",
    });
    expect(placed?.levelNames?.en).toBe("Secondary Year 1");
    expect(placed?.earlierYear).toBeUndefined();
    expect(JSON.parse(store.get(KEY) ?? "{}")).not.toHaveProperty(
      "earlierYear",
    );
  });

  it("is left as it was when the country has no class for that year", async () => {
    store.set(KEY, JSON.stringify({ country: "SK", schoolGrade: "grade_12" }));

    expect(await placeEarlierClass()).toBe(false);
    expect(getUserProfile()?.earlierYear).toBe(12);
  });

  it("asks nothing for a class chosen from the catalogue", async () => {
    store.set(KEY, JSON.stringify({ country: "SK", level: "stredna-1" }));

    expect(await placeEarlierClass()).toBe(false);
    expect(schoolSystems).not.toHaveBeenCalled();
  });
});
