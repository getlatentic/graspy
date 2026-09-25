import { describe, expect, it } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";
import { scopeContext } from "./tutor-context";

const curriculum: CurriculumData = {
  id: "c1",
  planId: "plan-1",
  country: "NG",
  countryName: "Nigeria",
  language: "yo",
  languageName: "Yoruba",
  gradeLevel: "JSS 1",
  subjects: [{ name: "Mathematics", slug: "mathematics" }],
  topics: { mathematics: ["Number Systems", "Fractions"] },
  createdAt: 0,
  updatedAt: 0,
};

const topicScope = {
  kind: "topic",
  planId: "plan-1",
  subjectSlug: "mathematics",
  topic: "Fractions",
} as const;

describe("scopeContext", () => {
  it("names the learner's place, subjects and the conversation's topic", () => {
    expect(scopeContext(curriculum, topicScope)).toEqual({
      country: "Nigeria",
      language: "Yoruba",
      gradeLevel: "JSS 1",
      planId: "plan-1",
      subject: "Mathematics",
      subjectSlug: "mathematics",
      topic: "Fractions",
      topics: ["Number Systems", "Fractions"],
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
    });
  });

  it("falls back to codes when the plan has no display names", () => {
    const { countryName: _c, languageName: _l, ...plain } = curriculum;
    const context = scopeContext(plain, topicScope);
    expect([context.country, context.language]).toEqual(["NG", "yo"]);
  });

  it("sends a subject without a topic, and neither for a general chat", () => {
    const subject = scopeContext(curriculum, {
      kind: "subject",
      planId: "plan-1",
      subjectSlug: "mathematics",
    });
    expect(subject).toMatchObject({ subject: "Mathematics" });
    expect(subject.topic).toBeUndefined();

    const general = scopeContext(curriculum, {
      kind: "general",
      planId: "plan-1",
    });
    expect(general.subject).toBeUndefined();
    expect(general.topics).toBeUndefined();
    expect(general.subjects).toHaveLength(1);
  });

  it("works before any plan exists", () => {
    expect(scopeContext(null, { kind: "earlier" })).toEqual({});
  });
});
