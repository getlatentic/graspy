import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CurriculumAccumulator,
  buildCurriculum,
} from "./curriculum-accumulator";
import type { CurriculumResultEvent } from "@/lib/curriculum-api";

const chunk = (c: Partial<CurriculumResultEvent>) => c as CurriculumResultEvent;

function accumulate(...chunks: Partial<CurriculumResultEvent>[]) {
  const acc = new CurriculumAccumulator();
  for (const c of chunks) acc.apply(chunk(c));
  return acc;
}

describe("CurriculumAccumulator", () => {
  it("accepts subjects as bare strings", () => {
    expect(
      accumulate({ subjects: ["Mathematics", "Chemistry"] }).subjects,
    ).toEqual([
      { name: "Mathematics", slug: "mathematics" },
      { name: "Chemistry", slug: "chemistry" },
    ]);
  });

  it("does not duplicate a subject whose slug arrives unnormalised", () => {
    const acc = accumulate(
      { subjects: ["Mathematics", "Chemistry"] },
      {
        subjects: [
          { name: "Mathematics", slug: "Mathematics" },
          { name: "Chemistry", slug: "Chemistry" },
        ],
      },
    );
    expect(acc.subjects.map((s) => s.slug)).toEqual([
      "mathematics",
      "chemistry",
    ]);
  });

  it("keys topics by slug whether the chunk used a slug or a display name", () => {
    const acc = accumulate(
      { subjects: ["Mathematics"] },
      { topics: { Mathematics: ["Algebra", "Geometry"] } },
    );
    expect(acc.topics).toEqual({ mathematics: ["Algebra", "Geometry"] });
  });

  it("renames in place rather than adding a second entry", () => {
    const acc = accumulate(
      { subjects: [{ name: "Maths", slug: "mathematics" }] },
      { subjects: [{ name: "Mathematics", slug: "mathematics" }] },
    );
    expect(acc.subjects).toEqual([
      { name: "Mathematics", slug: "mathematics" },
    ]);
  });
});

describe("CurriculumAccumulator.apply's change report", () => {
  it("is false for a repeated chunk", () => {
    const acc = new CurriculumAccumulator();
    const first = chunk({ subjects: ["Mathematics"] });
    expect(acc.apply(first)).toBe(true);
    expect(acc.apply(first)).toBe(false);
  });

  it.each([
    ["empty chunk", {}],
    ["empty subject list", { subjects: [] }],
    ["empty topics map", { topics: {} }],
    ["blank subject name", { subjects: [""] }],
  ])("is false for %s, which adds nothing", (_label, payload) => {
    const acc = new CurriculumAccumulator();
    expect(acc.apply(chunk(payload))).toBe(false);
    expect(acc.subjects).toEqual([]);
  });
});

describe("CurriculumAccumulator over arbitrary streams", () => {
  const nameArb = fc.constantFrom(
    "Mathematics",
    "Chemistry",
    "English Language",
    "Physics",
  );
  const entryArb = fc.oneof(
    nameArb.map((n) => n as string | { name: string; slug: string }),
    nameArb.map((n) => ({ name: n, slug: n })),
    nameArb.map((n) => ({ name: n, slug: n.toLowerCase() })),
  );

  it("never holds two entries for one name", () => {
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 12 }), (entries) => {
        const acc = accumulate(
          ...entries.map((entry) => ({ subjects: [entry] })),
        );
        const names = acc.subjects.map((s) => s.name);
        const slugs = acc.subjects.map((s) => s.slug);
        expect(new Set(names).size).toBe(names.length);
        expect(new Set(slugs).size).toBe(slugs.length);
      }),
    );
  });

  it("is idempotent: replaying a stream changes nothing", () => {
    fc.assert(
      fc.property(fc.array(nameArb, { maxLength: 8 }), (names) => {
        const acc = new CurriculumAccumulator();
        const feed = () =>
          names.forEach((n) => acc.apply(chunk({ subjects: [n] })));
        feed();
        const afterFirst = JSON.stringify(acc.subjects);
        feed();
        expect(JSON.stringify(acc.subjects)).toBe(afterFirst);
      }),
    );
  });
});

describe("buildCurriculum", () => {
  it("copies the topics map so later mutation cannot reach the record", () => {
    const topics = { mathematics: ["Algebra"] };
    const record = buildCurriculum({
      country: "Nigeria",
      language: "English",
      subjects: [],
      topics,
    });

    topics.mathematics.push("Calculus");

    expect(record.topics?.mathematics).toEqual(["Algebra"]);
  });
});
