import { describe, expect, it } from "vitest";
import type { CurriculumData, LearningSession } from "@/lib/curriculum-record";
import { buildCurriculum } from "./curriculum-accumulator";
import {
  goalIndex,
  namesAfter,
  pathsOf,
  subjectChange,
  topicLevel,
  withPath,
  withPathsFrom,
  withSubjects,
  topicKey,
  withTopic,
} from "./curriculum-edit";

const MATHS = { name: "Mathematics", slug: "mathematics" };
const SCIENCE = { name: "Basic Science", slug: "basic-science" };
const ENGLISH = { name: "English", slug: "english" };
const NOTHING_ADDED = { subjects: [], topics: {} };

function plan(extra: Partial<CurriculumData> = {}): CurriculumData {
  return {
    ...buildCurriculum({
      country: "NG",
      language: "en",
      subjects: [MATHS, SCIENCE],
      topics: {
        mathematics: ["Fractions", "Decimals"],
        "basic-science": ["Cells"],
      },
      nextSubjectSlug: "basic-science",
    }),
    ...extra,
  };
}

describe("withTopic", () => {
  it("adds a new topic at the end and says where", () => {
    const result = withTopic(plan(), "mathematics", "  Ratio ");

    expect(result?.index).toBe(2);
    expect(result?.curriculum.topics?.mathematics).toEqual([
      "Fractions",
      "Decimals",
      "Ratio",
    ]);
  });

  it("opens a topic already in the list instead of adding it twice", () => {
    const before = plan();
    const result = withTopic(before, "mathematics", "decimals");

    expect(result).toEqual({ curriculum: before, index: 1 });
  });

  it.each([
    ["Decimal", 1],
    ["  DECIMALS! ", 1],
    ["The decimals", 1],
    ["Décimals", 1],
    ["fraction", 0],
  ])("opens the topic already there for %j, which only differs in form", (title, index) => {
    const before = plan();

    expect(withTopic(before, "mathematics", title)).toEqual({ curriculum: before, index });
  });

  it("still adds a topic that is another topic: one that only contains the words of an existing one", () => {
    const result = withTopic(plan(), "mathematics", "Decimals and percentages");

    expect(result?.index).toBe(2);
  });

  it.each([
    ["history", "Wars"],
    ["mathematics", "   "],
  ])("refuses subject %s with title %j", (slug, title) => {
    expect(withTopic(plan(), slug, title)).toBeNull();
  });
});

describe("subjectChange", () => {
  it("splits a choice into kept, removed and added subjects", () => {
    expect(subjectChange([MATHS, SCIENCE], ["English", "Mathematics"])).toEqual(
      {
        kept: [MATHS],
        removed: [SCIENCE],
        added: ["English"],
      },
    );
  });
});

describe("withSubjects", () => {
  const session = {
    subject: "Basic Science",
    topicIndex: 0,
  } as LearningSession;

  it("keeps kept subjects' topics and appends the new ones", () => {
    const result = withSubjects(plan(), [MATHS], {
      subjects: [ENGLISH],
      topics: { english: ["Nouns"] },
    });

    expect(result.subjects).toEqual([MATHS, ENGLISH]);
    expect(result.topics).toEqual({
      mathematics: ["Fractions", "Decimals"],
      english: ["Nouns"],
    });
  });

  it("drops the lesson in progress and next subject with their subject", () => {
    const result = withSubjects(
      plan({ activeSession: session }),
      [MATHS],
      NOTHING_ADDED,
    );

    expect(result.activeSession).toBeUndefined();
    expect(result.assessment?.nextSubject).toBe("mathematics");
  });

  it("keeps the lesson in progress when its subject stays", () => {
    const result = withSubjects(
      plan({ activeSession: session }),
      [SCIENCE],
      NOTHING_ADDED,
    );

    expect(result.activeSession).toBe(session);
    expect(result.assessment?.nextSubject).toBe("basic-science");
  });
});

describe("namesAfter", () => {
  it("drops, keeps order, and appends new names once", () => {
    expect(
      namesAfter(
        [MATHS, SCIENCE],
        ["English", " English ", "Mathematics"],
        ["Basic Science"],
      ),
    ).toEqual(["Mathematics", "English"]);
  });
});

const REAL_ANALYSIS = {
  subject: "Real analysis",
  goal: "real analysis",
  steps: [
    { title: "Repeating decimals", level: "JSS 2" },
    { title: "Limits", level: "SS 3" },
    { title: "Limits", level: "SS 3" },
    { title: "Sequences and series", level: "first-year university" },
  ],
};

describe("withPath", () => {
  it("adds the path as a subject whose topics keep their order and levels", () => {
    const { curriculum, subject } = withPath(plan(), REAL_ANALYSIS);

    expect(subject).toEqual({ name: "Real analysis", slug: "real-analysis" });
    expect(curriculum.subjects.at(-1)).toEqual(subject);
    expect(curriculum.topics?.["real-analysis"]).toEqual([
      "Repeating decimals",
      "Limits",
      "Sequences and series",
    ]);
    expect(topicLevel(curriculum, subject, "Limits")).toBe("SS 3");
    expect(topicLevel(curriculum, MATHS, "Fractions")).toBe(
      curriculum.gradeLevel,
    );
  });

  it("records its last step as the goal the learner asked for", () => {
    const { curriculum, subject } = withPath(plan(), REAL_ANALYSIS);

    expect(curriculum.goals).toEqual({
      "real-analysis": "Sequences and series",
    });
    expect(goalIndex(curriculum, subject.slug)).toBe(2);
    expect(goalIndex(curriculum, MATHS.slug)).toBe(-1);
  });

  it("returns a subject already in the plan instead of adding it twice", () => {
    const once = withPath(plan(), REAL_ANALYSIS).curriculum;
    expect(withPath(once, REAL_ANALYSIS).curriculum).toBe(once);
  });
});

describe("paths across plan changes", () => {
  const withRealAnalysis = withPath(plan(), REAL_ANALYSIS).curriculum;
  const path = { name: "Real analysis", slug: "real-analysis" };

  it("keeps a kept path's levels and goal and drops a removed one's", () => {
    const kept = withSubjects(withRealAnalysis, [path], NOTHING_ADDED);
    expect(kept.levels).toHaveProperty("real-analysis");
    expect(goalIndex(kept, path.slug)).toBe(2);
    const dropped = withSubjects(withRealAnalysis, [MATHS], NOTHING_ADDED);
    expect([dropped.goals, dropped.levels]).toEqual([{}, {}]);
  });

  it("carries paths into a rebuilt plan", () => {
    const rebuilt = plan({ topics: { mathematics: ["New topic"] } });

    const merged = withPathsFrom(rebuilt, withRealAnalysis);

    expect(pathsOf(merged)).toEqual([path]);
    expect(merged.topics?.mathematics).toEqual(["New topic"]);
    expect(topicLevel(merged, path, "Limits")).toBe("SS 3");
    expect(goalIndex(merged, path.slug)).toBe(2);
  });
});

describe("topicKey", () => {
  it("makes one topic of its spellings, and not of different topics", () => {
    expect(topicKey("Ratio & Proportion")).toBe(topicKey("ratio and proportions"));
    expect(topicKey("Number Sense")).not.toBe(topicKey("Number"));
    expect(topicKey("Gas")).toBe("gas");
  });
});
