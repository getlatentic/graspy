import { describe, expect, it } from "vitest";
import { buildCurriculum } from "./curriculum-accumulator";
import { buildingRows } from "./plan-building-rows";

const plan = (topics: Record<string, string[]>) =>
  buildCurriculum({
    country: "NG",
    language: "en",
    subjects: [
      { name: "Mathematics", slug: "mathematics" },
      { name: "English", slug: "english" },
    ],
    topics,
  });

describe("buildingRows", () => {
  it("is the choosing of subjects alone before any subject is named", () => {
    const choosing = [{ kind: "choosing", state: "working" }];
    expect(buildingRows(null)).toEqual(choosing);
    expect(
      buildingRows(
        buildCurriculum({
          country: "",
          language: "",
          subjects: [],
          topics: {},
        }),
      ),
    ).toEqual(choosing);
  });

  it("works on one subject at a time and has the others wait", () => {
    const three = buildCurriculum({
      country: "NG",
      language: "en",
      subjects: [
        { name: "Mathematics", slug: "mathematics" },
        { name: "English", slug: "english" },
        { name: "Science", slug: "science" },
      ],
      topics: { mathematics: ["Fractions"] },
    });
    expect(buildingRows(three).map((row) => row.state)).toEqual([
      "done",
      "working",
      "waiting",
    ]);
  });

  it("has a subject working until its topics come, and done with their count after", () => {
    const rows = buildingRows(plan({ mathematics: ["Fractions", "Algebra"] }));
    expect(rows[0]).toMatchObject({
      kind: "subject",
      name: "Mathematics",
      topicCount: 2,
      state: "done",
    });
    expect(rows[1]).toMatchObject({
      kind: "subject",
      name: "English",
      topicCount: 0,
      state: "working",
    });
  });

  it("ends with the subjects: the plan is done when its topics are in, not when its first lesson is", () => {
    const rows = buildingRows(
      plan({ mathematics: ["Fractions"], english: ["Nouns"] }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["subject", "subject"]);
    expect(rows.every((row) => row.state === "done")).toBe(true);
  });
});
