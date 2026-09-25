import { describe, expect, it } from "vitest";
import {
  chatPath,
  scopeOf,
  targetFromParams,
  targetOf,
} from "@/features/learn/lib/chat-targets";
import type { CurriculumData } from "@/lib/curriculum-record";

const PLAN: CurriculumData = {
  id: "current",
  planId: "plan-1",
  country: "NG",
  language: "en",
  gradeLevel: "Grade 7",
  subjects: [
    { name: "Mathematics", slug: "mathematics" },
    { name: "Basic Science", slug: "basic-science" },
  ],
  topics: {
    mathematics: ["Fractions", "Decimals"],
    "basic-science": ["Fractions", "Living things"],
  },
  createdAt: 1,
  updatedAt: 1,
};
const WITHOUT_MATHS = { ...PLAN, subjects: PLAN.subjects.slice(1) };

const topic = (topicIndex: number, subjectSlug = "mathematics") =>
  ({ kind: "topic", subjectSlug, topicIndex }) as const;
const MATHS = { kind: "subject", subjectSlug: "mathematics" } as const;

describe("scopeOf and targetOf for a topic", () => {
  it("name a topic by its plan, subject and title, and find it again", () => {
    const scope = scopeOf(topic(1), PLAN);
    expect(scope).toEqual({
      kind: "topic",
      planId: "plan-1",
      subjectSlug: "mathematics",
      topic: "Decimals",
    });
    expect(targetOf(scope!, PLAN)).toEqual(topic(1));
  });

  it("keep the same title in two subjects apart", () => {
    expect(scopeOf(topic(0), PLAN)).not.toEqual(
      scopeOf(topic(0, "basic-science"), PLAN),
    );
  });

  it("follow a topic that moved within its subject", () => {
    const reordered = {
      ...PLAN,
      topics: { ...PLAN.topics, mathematics: ["Decimals", "Fractions"] },
    };
    expect(targetOf(scopeOf(topic(1), PLAN)!, reordered)).toEqual(topic(0));
  });

  it("find nothing for a rebuilt plan, a dropped subject or a missing topic", () => {
    const scope = scopeOf(topic(0), PLAN)!;
    expect(targetOf(scope, { ...PLAN, planId: "plan-2" })).toBeNull();
    expect(targetOf(scope, WITHOUT_MATHS)).toBeNull();
    expect(scopeOf(topic(9), PLAN)).toBeNull();
    expect(targetOf({ kind: "general", planId: "plan-2" }, PLAN)).toBeNull();
  });
});

describe("scopeOf and targetOf for a whole subject", () => {
  it("is found only while the plan has the subject", () => {
    const scope = scopeOf(MATHS, PLAN);
    expect(scope).toEqual({ ...MATHS, planId: "plan-1" });
    expect(targetOf(scope!, PLAN)).toEqual(MATHS);
    expect(targetOf(scope!, WITHOUT_MATHS)).toBeNull();
    expect(scopeOf({ kind: "subject", subjectSlug: "music" }, PLAN)).toBeNull();
  });
});

describe("chatPath and targetFromParams", () => {
  it("round-trip a whole subject through its own route", () => {
    const target = { kind: "subject", subjectSlug: "basic-science" } as const;
    expect(chatPath(target)).toBe("/app/learn/ask/subject/basic-science");
    expect(targetFromParams({ subjectSlug: "basic-science" })).toEqual(target);
  });

  it.each([
    topic(3, "basic-science"),
    { kind: "general" },
    { kind: "earlier" },
  ] as const)("round-trip %o", (target) => {
    const [, , , , subject, topicIndex] = chatPath(target).split("/");
    expect(targetFromParams({ subject, topicIndex })).toEqual(target);
  });

  it.each([
    { subject: "mathematics" },
    { subject: "mathematics", topicIndex: "-1" },
    { subject: "mathematics", topicIndex: "x" },
  ])("reject %o", (params) => {
    expect(targetFromParams(params)).toBeNull();
  });
});
