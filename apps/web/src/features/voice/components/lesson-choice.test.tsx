// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import type { CatalogueLesson, Standing } from "@/lib/voice/voice-types";
import { LessonChoice } from "./lesson-choice";

const lesson = (
  plan_id: string,
  patch: Partial<CatalogueLesson> = {},
): CatalogueLesson => ({
  plan_id,
  subject: "mathematics",
  topic: "number",
  title: { en: `Title ${plan_id}` },
  standing: "untouched",
  days_correct: 0,
  current: false,
  ...patch,
});

const LESSONS = [
  lesson("a", {
    topic: "alphabet",
    current: true,
    standing: "started",
    days_correct: 1,
  }),
  lesson("b", { topic: "alphabet", standing: "untouched" }),
  lesson("c", { topic: "number", standing: "learnt" }),
  lesson("d", { topic: "astronomy", standing: "mastered", days_correct: 2 }),
];

const show = (lessons: CatalogueLesson[]) =>
  render(
    <KeysApp>
      <LessonChoice lessons={lessons} language="en" />
    </KeysApp>,
  );

const hrefOf = (name: RegExp | string) =>
  screen.getByRole("link", { name }).getAttribute("href");

afterEach(cleanup);

describe("the play card", () => {
  it("is the whole card, a link to the current lesson, whose circle is named", () => {
    show(LESSONS);

    const card = screen
      .getAllByRole("link")
      .find((a) => a.querySelector('[role="img"]'));
    expect(card?.getAttribute("href")).toBe("/app/learn/voice/lesson");
    expect(
      within(card!).getByRole("img", { name: "voice.start" }),
    ).toBeTruthy();
    expect(card!.textContent).toContain("Title a");
  });

  it("says in hidden text that the lesson is next and how many days were right", () => {
    show(LESSONS);

    const card = screen
      .getAllByRole("link")
      .find((a) => a.querySelector('[role="img"]'))!;
    const hidden = [...card.querySelectorAll(".sr-only")].map(
      (e) => e.textContent,
    );
    expect(hidden).toEqual(["voice.next", "voice.daysRight 1 2"]);
  });

  it("is not there when no lesson is current, and the tiles still are", () => {
    show(LESSONS.map((l) => ({ ...l, current: false })));

    expect(screen.queryByRole("img", { name: "voice.start" })).toBeNull();
    expect(screen.queryByText("voice.next")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(LESSONS.length);
  });
});

describe("the tiles", () => {
  it("link every lesson, the current one to the next lesson and the others to themselves", () => {
    show(LESSONS);

    expect(screen.getAllByRole("link")).toHaveLength(LESSONS.length + 1);
    expect(hrefOf(/^Title a/)).toBe("/app/learn/voice/lesson");
    expect(hrefOf(/^Title b/)).toBe("/app/learn/voice/lesson?plan=b");
    expect(hrefOf(/^Title c/)).toBe("/app/learn/voice/lesson?plan=c");
  });

  it("sit in one list, in teaching order", () => {
    show(LESSONS);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(LESSONS.length);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
  });

  it("show no standing word, but give each tile its standing as hidden text", () => {
    show(LESSONS);

    for (const node of screen.getAllByText(/voice\.standing\./)) {
      expect(node.closest(".sr-only")).not.toBeNull();
    }
    const tile = (title: RegExp) => screen.getByRole("link", { name: title });
    expect(tile(/^Title a/).textContent).toContain("voice.topics.alphabet");
    expect(tile(/^Title a/).textContent).toContain("voice.standing.started");
    expect(tile(/^Title b/).textContent).toContain("voice.standing.untouched");
    expect(tile(/^Title c/).textContent).toContain("voice.standing.learnt");
    expect(tile(/^Title d/).textContent).toContain("voice.standing.mastered");
    expect(document.body.textContent).not.toContain("voice.startHere");
    expect(document.body.textContent).not.toMatch(/\d\s*\/\s*\d/);
  });

  it("draw a different symbol for each standing, green only for known", () => {
    show(LESSONS);

    const symbolOf = (title: RegExp) =>
      screen.getByRole("link", { name: title }).querySelector("[data-symbol]")!;
    const symbols: Record<Standing, Element> = {
      started: symbolOf(/^Title a/),
      untouched: symbolOf(/^Title b/),
      learnt: symbolOf(/^Title c/),
      mastered: symbolOf(/^Title d/),
    };
    for (const [standing, node] of Object.entries(symbols))
      expect(node.getAttribute("data-symbol")).toBe(standing);
    expect(symbols.mastered.className).toContain("bg-success");
    expect(symbols.learnt.className).toContain("bg-accent");
    expect(symbols.learnt.className).not.toContain("bg-success");
    expect(symbols.mastered.querySelector("svg")).not.toBeNull();
    expect(symbols.started.querySelector("path")).not.toBeNull();
    expect(symbols.untouched.querySelector("path")).toBeNull();
  });

  it("draw the icon of the theme, and the neutral one for a theme not known", () => {
    show(LESSONS);

    const iconOf = (title: RegExp) =>
      screen
        .getByRole("link", { name: title })
        .querySelector("svg.lucide")!
        .getAttribute("class");
    expect(iconOf(/^Title b/)).toContain("lucide-type");
    expect(iconOf(/^Title c/)).toContain("lucide-hash");
    expect(iconOf(/^Title d/)).toContain("lucide-sparkles");
  });
});
