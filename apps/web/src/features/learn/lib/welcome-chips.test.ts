import { describe, expect, it, vi } from "vitest";
import type { ThreadScope } from "@/lib/chat-db";
import { welcomeChips } from "./welcome-chips";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

function chipsFor(scope: ThreadScope, starting = false) {
  const ask = vi.fn();
  const fill = vi.fn();
  const chips = welcomeChips({
    scope,
    subjectName: "Mathematics",
    current: null,
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
