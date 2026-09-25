import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { LessonContent } from "../domain/lessonContent";
import { emptyLessonContent } from "../domain/lessonContentEditing";
import { EditableLesson } from "./EditableLesson";

type LessonBlock = LessonContent["steps"][number]["blocks"][number];

function blockOf(kind: string): LessonBlock {
  if (kind === "explanation") return { id: "b", type: "explanation", content: "" };
  if (kind === "worked_example") {
    return { id: "b", type: "worked_example", problem: "", steps: [], finalAnswer: "" };
  }
  return { id: "b", type: "practice", question: "", expectedAnswer: "", hints: [] };
}

function Harness({
  initial,
  onContent,
}: {
  readonly initial: LessonContent;
  /** The saved content, so a test can check what was stored and not merely shown. */
  readonly onContent?: (content: LessonContent) => void;
}) {
  const [content, setContent] = useState(initial);
  return (
    <EditableLesson
      content={content}
      onChange={(next) => {
        setContent(next);
        onContent?.(next);
      }}
    />
  );
}

describe("EditableLesson", () => {
  /// All three lists share one implementation now, and the checks are the ones
  /// with an identity of their own. Keyed by position instead, moving a row
  /// rewrites every row after it rather than moving it.
  it("edits the check a teacher moved, not the one now in its place", async () => {
    const user = userEvent.setup();
    let saved: LessonContent | null = null;
    render(<Harness initial={emptyLessonContent()} onContent={(next) => { saved = next; }} />);

    await user.click(screen.getByRole("button", { name: "Add a homework question" }));
    await user.type(screen.getByRole("textbox", { name: "Check 1 question" }), "first");
    await user.click(screen.getByRole("button", { name: "Add a homework question" }));
    await user.type(screen.getByRole("textbox", { name: "Check 2 question" }), "second");

    await user.click(screen.getByRole("button", { name: "Move homework question 2 up" }));
    expect(saved!.checks.map(({ question }) => question)).toEqual(["second", "first"]);

    // Row one is now the check that was second; writing to it must reach that one.
    await user.type(screen.getByRole("textbox", { name: "Check 1 answer" }), "yes");
    const moved = saved!.checks[0];
    expect(moved.question).toBe("second");
    expect(moved.expectedAnswer).toBe("yes");
  });

  /// The buttons that add a block are read off the same table that renders it,
  /// so the wording is derived rather than repeated — and derived wording is
  /// exactly what changes without anyone noticing.
  it("offers a way to add each kind of block, named as the block is named", async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyLessonContent()} />);
    await user.click(screen.getByRole("button", { name: "Add step" }));

    for (const label of ["Add explanation", "Add worked example", "Add practice"]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
  });

  /// The goals and the instructional materials are the same list rendered twice, so each
  /// must still reach its own part of the lesson rather than the other's.
  it("keeps the goals and the instructional materials apart, though they share a list", async () => {
    const user = userEvent.setup();
    let saved: LessonContent | null = null;
    render(<Harness initial={emptyLessonContent()} onContent={(next) => { saved = next; }} />);

    await user.click(screen.getByRole("button", { name: "Add goal" }));
    await user.type(screen.getByRole("textbox", { name: "Learning goal 1" }), "Order fractions");
    await user.click(screen.getByRole("button", { name: "Add material" }));
    await user.type(screen.getByRole("textbox", { name: "Material 1" }), "Fraction strips");

    expect(saved!.objectives).toEqual(["Order fractions"]);
    expect(saved!.instructionalMaterials).toEqual(["Fraction strips"]);

    // Removing one list's item leaves the other alone.
    await user.click(screen.getByRole("button", { name: "Remove learning goal 1" }));
    expect(saved!.objectives).toEqual([]);
    expect(saved!.instructionalMaterials).toEqual(["Fraction strips"]);
  });

  /// Every kind of block writes to its own field, and the two that ask
  /// something carry an answer beside the question. A table decides all of
  /// that now, so a row pointing at the wrong field would look like a box that
  /// quietly forgets what is typed into it.
  it.each([
    ["explanation", "Explanation", null],
    ["worked_example", "Worked example problem", "Worked example answer"],
    ["practice", "Practice question", "Practice answer"],
  ])("writes a %s into its own fields", async (kind, proseLabel, answerLabel) => {
    const user = userEvent.setup();
    const content: LessonContent = {
      ...emptyLessonContent(),
      steps: [
        {
          id: "step-1",
          title: "Step",
          durationMinutes: null,
          summary: "",
          blocks: [blockOf(kind)],
        },
      ],
    };
    let saved: LessonContent | null = null;
    render(<Harness initial={content} onContent={(next) => { saved = next; }} />);

    await user.type(screen.getByRole("textbox", { name: proseLabel }), "x");
    // What was stored, not what the box shows: a row pointing at the wrong
    // field still shows what was typed, because it reads back what it wrote.
    const proseFields: Record<string, string> = {
      explanation: "content",
      worked_example: "problem",
      practice: "question",
    };
    expect((saved!.steps[0].blocks[0] as Record<string, unknown>)[proseFields[kind]]).toBe("x");

    if (answerLabel === null) {
      expect(screen.queryByRole("textbox", { name: /answer/i })).toBeNull();
      return;
    }
    await user.type(screen.getByRole("textbox", { name: answerLabel }), "4");
    const answerFields: Record<string, string> = {
      worked_example: "finalAnswer",
      practice: "expectedAnswer",
    };
    expect((saved!.steps[0].blocks[0] as Record<string, unknown>)[answerFields[kind]]).toBe("4");
  });

  it("grows a lesson from nothing: add a goal, a step and a block, then write them", async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyLessonContent()} />);

    await user.click(screen.getByRole("button", { name: "Add goal" }));
    await user.type(screen.getByLabelText("Learning goal 1"), "Count in millions.");
    expect(screen.getByLabelText("Learning goal 1")).toHaveValue("Count in millions.");

    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.type(screen.getByLabelText("Step 1 title"), "Count forward");
    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Count forward");

    await user.click(screen.getByRole("button", { name: "Add explanation" }));
    await user.type(screen.getByLabelText("Explanation"), "A million is a thousand thousands.");
    expect(screen.getByLabelText("Explanation")).toHaveValue("A million is a thousand thousands.");
  });

  it("stacks nothing empty in advance — an empty lesson shows only the ways to add", () => {
    render(<Harness initial={emptyLessonContent()} />);

    expect(screen.getByRole("button", { name: "Add goal" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add step" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a homework question" })).toBeVisible();
    expect(screen.queryByLabelText("Learning goal 1")).toBeNull();
    expect(screen.queryByLabelText("Step 1 title")).toBeNull();
  });

  it("removes a step and leaves the rest in place", async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyLessonContent()} />);
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.type(screen.getByLabelText("Step 2 title"), "Second");

    await user.click(screen.getByRole("button", { name: "Remove step 1" }));

    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Second");
    expect(screen.queryByLabelText("Step 2 title")).toBeNull();
  });
});
