import { describe, expect, it } from "vitest";
import type { CatalogueLesson } from "@/lib/voice/voice-types";
import { byTopic } from "./catalogue-groups";

const lesson = (plan_id: string, topic: string): CatalogueLesson => ({
  plan_id,
  subject: "mathematics",
  topic,
  title: { en: plan_id },
  standing: "untouched",
  days_correct: 0,
  current: false,
});

describe("byTopic", () => {
  it("groups lessons under their theme, keeping teaching order", () => {
    const groups = byTopic([
      lesson("a", "number"),
      lesson("b", "multiplication"),
      lesson("c", "number"),
    ]);
    expect(
      groups.map((g) => [g.topic, g.lessons.map((l) => l.plan_id)]),
    ).toEqual([
      ["number", ["a", "c"]],
      ["multiplication", ["b"]],
    ]);
  });
});
