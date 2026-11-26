import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const detected = vi.hoisted(() => ({ country: "SK" as string | null }));
vi.mock("@/lib/locale-detector", () => ({
  detectLocale: () => ({ language: "en", country: detected.country }),
}));

const { scopeContext } = await import("./tutor-context");

const NEW: CurriculumData = {
  id: "c1",
  planId: "plan-1",
  country: "",
  countryName: "",
  countryCode: "",
  language: "en",
  languageName: "English",
  gradeLevel: "",
  subjects: [],
  topics: {},
  createdAt: 0,
  updatedAt: 0,
};
const general = { kind: "general", planId: "plan-1" } as const;

beforeEach(() => {
  detected.country = "SK";
});

describe("the country of a learner who has not said it", () => {
  it("goes to the server as the device's guess, never as the learner's country", () => {
    const sent = scopeContext(NEW, general);

    expect(sent.deviceCountry).toBe("SK");
    expect(sent.country).toBeUndefined();
    expect(sent.countryCode).toBeUndefined();
    expect(sent.emptyPlan).toBe(true);
  });

  it("is a country an earlier open of the link kept, only as a guess too", () => {
    detected.country = null;
    const sent = scopeContext(
      { ...NEW, country: "GH", countryName: "Ghana", countryCode: "GH" },
      general,
    );

    expect(sent.deviceCountry).toBe("GH");
    expect(sent.countryCode).toBeUndefined();
  });

  it("is nothing when the device has no idea either", () => {
    detected.country = null;

    expect(scopeContext(NEW, general).deviceCountry).toBeUndefined();
  });
});

describe("the country of a learner who has said their class", () => {
  it("is theirs, and no guess goes with it", () => {
    const sent = scopeContext(
      {
        ...NEW,
        country: "NG",
        countryName: "Nigeria",
        countryCode: "NG",
        gradeLevel: "JSS 1",
      },
      general,
    );

    expect(sent).toMatchObject({ country: "Nigeria", countryCode: "NG" });
    expect(sent.deviceCountry).toBeUndefined();
  });
});
