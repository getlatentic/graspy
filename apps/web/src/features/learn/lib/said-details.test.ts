import { describe, expect, it, vi } from "vitest";
import type { SchoolSystem } from "@/lib/education-api";
import type { LearnerDetails } from "@/lib/user-storage";
import { detailsSaid } from "./said-details";

const NIGERIA: SchoolSystem = {
  id: "NG",
  country: "NG",
  name: { en: "Nigeria" },
  main: true,
  stages: [
    { id: "early", name: { en: "Early childhood" } },
    { id: "jss", name: { en: "Junior Secondary School" } },
  ],
  levels: [
    {
      id: "nursery-1",
      stage: "early",
      year: -2,
      name: { en: "Nursery 1" },
      aliases: [],
      age: 3,
      voiceOnly: true,
    },
    {
      id: "jss-1",
      stage: "jss",
      year: 7,
      name: { en: "JSS 1" },
      aliases: ["Junior Secondary 1"],
      age: 12,
      voiceOnly: false,
    },
  ],
};
const systemsOf = vi.fn(async () => [NIGERIA]);

const KEPT: LearnerDetails = {
  country: "NG",
  language: "en",
  system: "",
  level: "",
  levelNames: null,
  course: "",
  gradeLevel: "",
};
const said = (className: string, country = "", course = "") => ({
  type: "set_details" as const,
  className,
  country,
  course,
});

describe("what a learner says of their school", () => {
  it("is a class of the country's catalogue, with the descriptor the server reads", async () => {
    const result = await detailsSaid(said("jss 1"), KEPT, systemsOf);

    expect(systemsOf).toHaveBeenCalledWith("NG");
    expect(result).toEqual({
      details: {
        country: "NG",
        language: "en",
        system: "NG",
        level: "jss-1",
        levelNames: { en: "JSS 1" },
        course: "",
        gradeLevel: "JSS 1 (Junior Secondary School), Nigeria, age 12",
      },
      voiceOnly: false,
    });
  });

  it("finds a class by an alias, in any case and spacing", async () => {
    const result = await detailsSaid(
      said("  junior secondary 1 "),
      KEPT,
      systemsOf,
    );

    expect(result?.details.level).toBe("jss-1");
  });

  it("says whether the class learns by voice alone, as the catalogue does", async () => {
    const result = await detailsSaid(said("Nursery 1"), KEPT, systemsOf);

    expect(result?.voiceOnly).toBe(true);
  });

  it("takes the country the learner names, and looks for the class there", async () => {
    await detailsSaid(said("Grade 5", "ghana"), KEPT, systemsOf);

    expect(systemsOf).toHaveBeenLastCalledWith("GH");
  });

  it("is null for a class the catalogue does not hold", async () => {
    expect(await detailsSaid(said("Year 40"), KEPT, systemsOf)).toBeNull();
  });

  it("is null for a country that is none", async () => {
    expect(
      await detailsSaid(said("JSS 1", "Narnia"), KEPT, systemsOf),
    ).toBeNull();
  });

  it("is null when no country is known to look the class up in", async () => {
    expect(
      await detailsSaid(said("JSS 1"), { ...KEPT, country: "" }, systemsOf),
    ).toBeNull();
  });

  it("is an undergraduate or graduate level with the course, and never an age", async () => {
    const result = await detailsSaid(
      said("Undergraduate", "", "Accounting"),
      KEPT,
      systemsOf,
    );

    expect(result?.voiceOnly).toBe(false);
    expect(result?.details).toMatchObject({
      system: "",
      level: "undergraduate",
      levelNames: null,
      course: "Accounting",
      gradeLevel: "Undergraduate student, studying Accounting",
    });
  });

  it("needs the course for a level after school", async () => {
    expect(await detailsSaid(said("Graduate"), KEPT, systemsOf)).toBeNull();
  });

  it("keeps the class when only the same country is said, and drops it for another", async () => {
    const withClass = { ...KEPT, system: "NG", level: "jss-1" };

    expect((await detailsSaid(said("", "Nigeria"), withClass))?.details).toBe(
      withClass,
    );
    expect((await detailsSaid(said("", "Ghana"), withClass))?.voiceOnly).toBe(
      false,
    );
    expect(
      (await detailsSaid(said("", "Ghana"), withClass))?.details,
    ).toMatchObject({ country: "GH", system: "", level: "", gradeLevel: "" });
  });
});

describe("the country the server names", () => {
  const nameless = said("Grade 7", "Not a name the app knows");

  it.each(["CZ", "TR", "MM", "HK", "CI", "GB", "PS", "CD", "SK"])(
    "is saved by its code %s, whatever name goes with it",
    async (code) => {
      const systems = vi.fn(async () => [NIGERIA]);

      await detailsSaid({ ...nameless, countryCode: code }, KEPT, systems);

      expect(systems).toHaveBeenCalledWith(code);
    },
  );

  it.each([
    ["Czechia", "CZ"],
    ["Türkiye", "TR"],
    ["United Kingdom", "GB"],
  ])(
    "is found by the catalogue's name %s when no code comes",
    async (name, code) => {
      const systems = vi.fn(async () => [NIGERIA]);

      await detailsSaid(said("Grade 7", name), KEPT, systems);

      expect(systems).toHaveBeenCalledWith(code);
    },
  );

  it("falls back to the name for a code the app does not have, and to the kept country for none", async () => {
    const systems = vi.fn(async () => [NIGERIA]);

    await detailsSaid(
      { ...said("Grade 7", "Czechia"), countryCode: "ZZ" },
      KEPT,
      systems,
    );
    expect(systems).toHaveBeenLastCalledWith("CZ");

    await detailsSaid(said("Grade 7"), KEPT, systems);
    expect(systems).toHaveBeenLastCalledWith("NG");
  });
});
