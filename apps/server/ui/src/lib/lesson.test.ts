import { describe, expect, it } from "vitest";
import contract from "./card-contract.json";
import { practiceAnswer } from "./content";
import { lessonViewOf, topicOf, whereOf } from "./lesson";

const opened = contract.content["ui://graspy/lesson"];
const target = opened.target;

describe("the server's lesson", () => {
  it("is what the lesson view shows", () => {
    const view = lessonViewOf(opened)!;

    expect(view.status).toBe("ready");
    expect(view.lesson?.objectives).toEqual(opened.lesson.objectives);
    expect(view.lesson?.slides[0].assessment?.options).toHaveLength(2);
  });

  it("is finished and checked with the arguments the server reads", () => {
    const view = lessonViewOf(opened)!;
    const check = view.lesson!.slides[0].assessment!;
    const { arguments: expected } = contract.lesson.check;

    expect(topicOf(view.target)).toEqual(contract.lesson.finish.arguments);
    expect(
      practiceAnswer(
        { ...check, question: check.prompt },
        expected.chosenIndex,
        whereOf(view.target),
        `${contract.lesson.meta.viewUUID}:0`,
      ),
    ).toEqual(expected);
  });
});

describe("a lesson as it arrives", () => {
  it("leaves out a slide or a check that is not one", () => {
    const view = lessonViewOf({
      status: "making",
      whole: false,
      target,
      lesson: {
        title: "Fractions",
        slides: [
          { title: "Kept", bodyMd: "Body", assessment: { prompt: "?" } },
          { title: "No body" },
        ],
      },
    });

    expect(view?.attempt).toBe(0);
    expect(view?.lesson?.slides).toEqual([
      { slideType: "", title: "Kept", bodyMd: "Body", assessment: null },
    ]);
  });

  it("keeps only the objectives that are text, and none when it has none", () => {
    const lessonWith = (objectives: unknown) =>
      lessonViewOf({
        status: "making",
        target,
        lesson: { title: "Fractions", objectives, slides: [] },
      })?.lesson?.objectives;

    expect(lessonWith(["Name the parts", 3, null])).toEqual(["Name the parts"]);
    expect(lessonWith(undefined)).toEqual([]);
  });

  it("is refused without a status the view knows or a topic", () => {
    expect(lessonViewOf({ status: "lost", target, lesson: null })).toBeNull();
    expect(lessonViewOf({ status: "ready", lesson: null })).toBeNull();
    expect(
      lessonViewOf({ status: "failed", target, lesson: null }),
    ).not.toBeNull();
  });
});

describe("a lesson on a topic of an official curriculum", () => {
  it("says what it was written from, as the server sends it", () => {
    const grounding = lessonViewOf(opened)!.lesson!.grounding!;

    expect(grounding.authority).toBe("NERDC");
    expect(grounding.objectives).toEqual(["Name the parts of a fraction."]);
    expect(grounding.passages).toEqual([
      { title: "3.1 What is a fraction?", chapter: "Chapter 3: Fractions" },
    ]);
    expect(grounding.textbook?.licence).toContain("Attribution");
  });

  it("has none when a model planned it", () => {
    const planned = {
      ...opened,
      lesson: { ...opened.lesson, grounding: null },
    };

    expect(lessonViewOf(planned)!.lesson!.grounding).toBeNull();
  });

  it("keeps its objectives and says no passage is linked when the textbook is absent", () => {
    const bare = {
      ...opened,
      lesson: {
        ...opened.lesson,
        grounding: {
          authority: "NERDC",
          edition: "September 2025",
          objectives: [{ code: "a", statement: "Count in millions." }],
          passages: [],
          textbook: null,
        },
      },
    };
    const grounding = lessonViewOf(bare)!.lesson!.grounding!;

    expect(grounding.objectives).toEqual(["Count in millions."]);
    expect(grounding.passages).toEqual([]);
    expect(grounding.textbook).toBeNull();
  });
});
