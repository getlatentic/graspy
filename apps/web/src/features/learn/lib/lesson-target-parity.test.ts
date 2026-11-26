import { describe, expect, it } from "vitest";
import contract from "@/lib/a2a/reply-contract.json";
import { agentData } from "@/lib/a2a/reply-data";
import { ROLE_AGENT } from "@/lib/a2a/reply-data";
import type { CurriculumData } from "@/lib/curriculum-record";
import { buildCurriculum } from "./curriculum-accumulator";
import { withPaths } from "./curriculum-edit";
import { lessonTarget } from "./lesson-app";

// The lesson the tutor makes for a topic, before the learner opens it, is found again only if it
// is named exactly as the app names it once the course is in the plan. The server writes the
// target of a start card (apps/server/scripts/export_reply_contract.py); here the app names the
// same topic from the plan its own code makes of the course the learner chose.
const reply = agentData({
  role: ROLE_AGENT,
  parts: [{ content: { $case: "data", value: contract.reply } }],
});

describe("the lesson the tutor makes for a topic the learner chose", () => {
  it("is named as the app names it once the course is in the plan", () => {
    const added = reply.actions.find((action) => action.type === "add_paths");
    const start = reply.cards.find(
      (card) => card.resourceUri === "ui://graspy/start",
    );
    if (added?.type !== "add_paths" || !start)
      throw new Error("not in contract");
    const made = start.toolResult.structuredContent as {
      target: Record<string, unknown>;
      openPath: string;
    };
    // The plan the learner had when they chose: the one the server read the lesson's fields from.
    const before: CurriculumData = {
      ...buildCurriculum({
        country: "Nigeria",
        language: "English",
        gradeLevel: "JSS 1",
        subjects: [],
        topics: {},
        nextSubjectSlug: "",
      }),
      planId: "plan-1",
    };

    const { curriculum, outcomes } = withPaths(before, added.paths);
    const outcome = outcomes[0];
    if (outcome.status !== "added") throw new Error(outcome.status);
    const target = lessonTarget(
      curriculum,
      outcome.subject,
      Number(made.target.topicIndex),
    );

    expect(target).not.toBeNull();
    expect({ buildsOn: [], ...target }).toEqual(made.target);
    expect(made.openPath).toBe(
      `/app/learn/${outcome.subject.slug}/lesson/${made.target.topicIndex}`,
    );
  });
});
