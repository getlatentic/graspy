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
  it("is the choosing of subjects, then the lesson to wait for, before any subject is named", () => {
    expect(buildingRows(null, false)).toEqual([
      { kind: "choosing", state: "working" },
      { kind: "lesson", state: "waiting" },
    ]);
    expect(
      buildingRows(
        buildCurriculum({
          country: "",
          language: "",
          subjects: [],
          topics: {},
        }),
        false,
      ),
    ).toHaveLength(2);
  });

  it("has a subject working until its topics come, and done with their count after", () => {
    const rows = buildingRows(
      plan({ mathematics: ["Fractions", "Algebra"] }),
      false,
    );
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

  it("makes the first lesson the last row, waiting until the lesson is being made", () => {
    const topics = { mathematics: ["Fractions"], english: ["Nouns"] };
    expect(buildingRows(plan(topics), false).at(-1)).toEqual({
      kind: "lesson",
      state: "waiting",
    });
    expect(buildingRows(plan(topics), true).at(-1)).toEqual({
      kind: "lesson",
      state: "working",
    });
  });
});
