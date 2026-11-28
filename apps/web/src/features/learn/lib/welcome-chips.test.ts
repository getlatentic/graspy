import { describe, expect, it, vi } from "vitest";
import type { ThreadScope } from "@/lib/chat-db";
import type { CurrentTopic } from "./current-topic";
import { welcomeChips } from "./welcome-chips";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

function chipsFor(
  scope: ThreadScope,
  starting = false,
  current: CurrentTopic | null = null,
) {
  const ask = vi.fn();
  const fill = vi.fn();
  const chips = welcomeChips({
    scope,
    subjectName: "Mathematics",
    current,
    starting,
    t,
    ask,
    fill,
  });
  return { chips, ask, fill };
}

describe("welcomeChips", () => {
  it("sends a topic's three questions, worded for the topic", () => {
    const { chips, ask, fill } = chipsFor({
      kind: "topic",
      planId: "p",
      subjectSlug: "mathematics",
      topic: "Fractions",
    });

    expect(chips.map((chip) => chip.label)).toEqual([
      "chat.quickActionExplain",
      "chat.quickActionExamples",
      "chat.quickActionRelated",
    ]);
    chips[2]!.run();
    expect(ask).toHaveBeenCalledWith(
      'chat.quickActionRelatedPrompt {"topic":"Fractions","subject":"Mathematics"}',
    );
    expect(fill).not.toHaveBeenCalled();
  });

  it("offers the general chat a practice and a plan, written to the composer", () => {
    const { chips, ask, fill } = chipsFor({ kind: "general", planId: "p" });

    expect(chips.map((chip) => chip.label)).toEqual([
      "home.practiseTitle",
      "home.planTitle",
    ]);
    chips[1]!.run();
    expect(fill).toHaveBeenCalledWith("home.planDraft");
    expect(ask).not.toHaveBeenCalled();
  });

  it("writes the practice chip for the topic the learner is on, or for what they are learning", () => {
    const general = { kind: "general", planId: "p" } as const;
    const on = chipsFor(general, false, { topic: "Fractions" } as CurrentTopic);
    on.chips[0]!.run();
    expect(on.fill).toHaveBeenCalledWith(
      'home.practiseDraft {"topic":"Fractions"}',
    );

    const none = chipsFor(general);
    none.chips[0]!.run();
    expect(none.fill).toHaveBeenCalledWith("home.practiseDraftAny");
  });

  it("offers a new learner's first chat none", () => {
    expect(chipsFor({ kind: "general", planId: "p" }, true).chips).toEqual([]);
  });

  it("offers a subject chat none", () => {
    expect(
      chipsFor({ kind: "subject", planId: "p", subjectSlug: "mathematics" })
        .chips,
    ).toEqual([]);
  });
});
