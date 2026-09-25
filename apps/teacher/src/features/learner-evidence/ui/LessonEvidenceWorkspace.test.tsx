import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LessonEvidenceGateway } from "../application/LessonEvidenceGateway";
import type { LessonEvidenceWorkspaceSnapshot, SaveLessonEvidenceRequest } from "../domain/lessonEvidence";
import { LessonEvidenceWorkspace } from "./LessonEvidenceWorkspace";

const context = { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" };
const initial: LessonEvidenceWorkspaceSnapshot = {
  lesson: { lessonId: "lesson", lessonVersionId: "version", lessonVersionNumber: 1, topic: "Linear equations", learningGoals: ["Solve equations", "Explain inverse operations"] },
  evidence: null,
};

function gateway(): LessonEvidenceGateway {
  let revision = 0;
  return {
    getWorkspace: vi.fn().mockResolvedValue(initial),
    save: vi.fn().mockImplementation(async (request: SaveLessonEvidenceRequest) => {
      revision += 1;
      return {
        lesson: initial.lesson,
        evidence: {
          id: "evidence",
          status: request.status,
          revision,
          groups: request.groups.map((group) => ({ ...group, id: group.id ?? `group-${group.position}` })),
        },
      } satisfies LessonEvidenceWorkspaceSnapshot;
    }),
  };
}

describe("LessonEvidenceWorkspace", () => {
  it("creates three teaching groups before opening the learning-goal index", async () => {
    const user = userEvent.setup();
    const evidenceGateway = gateway();
    render(<LessonEvidenceWorkspace lessonId="lesson" context={context} gateway={evidenceGateway} onBack={vi.fn()} />);

    expect(await screen.findByDisplayValue("Needs support")).toBeVisible();
    expect(screen.getByDisplayValue("Developing")).toBeVisible();
    expect(screen.getByDisplayValue("Secure")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start recording" }));

    expect(await screen.findByRole("heading", { name: "Solve equations" })).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(screen.getAllByRole("option", { name: "2 · A little sure" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "3 · Okay" })).toHaveLength(3);
    expect(evidenceGateway.save).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", expectedRevision: null }));
  });

  it("persists the current goal and advances to the next one", async () => {
    const user = userEvent.setup();
    const evidenceGateway = gateway();
    render(<LessonEvidenceWorkspace lessonId="lesson" context={context} gateway={evidenceGateway} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Start recording" }));

    const correct = await screen.findAllByLabelText("Correct");
    const total = screen.getAllByLabelText("Total");
    for (let index = 0; index < 3; index += 1) {
      await user.type(correct[index], "2");
      await user.type(total[index], "3");
    }
    await user.click(screen.getByRole("button", { name: "Save and next goal" }));
    expect(await screen.findByRole("heading", { name: "Explain inverse operations" })).toBeVisible();
    expect(evidenceGateway.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: "draft", expectedRevision: 1 }));
  });

  it("preserves finished results when a teacher edits them", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const completed: LessonEvidenceWorkspaceSnapshot = {
      lesson: initial.lesson,
      evidence: {
        id: "evidence",
        status: "complete",
        revision: 4,
        groups: ["Needs support", "Developing", "Secure"].map((name, index) => ({
          id: `group-${index + 1}`,
          position: index + 1,
          name,
          interestScore: null,
          lessonFeelingScore: null,
          entries: initial.lesson.learningGoals.map((_, goalIndex) => ({
            learningGoalNumber: goalIndex + 1,
            questionsCorrect: 2,
            questionsTotal: 3,
            misunderstandingNote: null,
            confidenceScore: null,
            difficultyScore: null,
          })),
        })),
      },
    };
    const evidenceGateway: LessonEvidenceGateway = {
      getWorkspace: vi.fn().mockResolvedValue(completed),
      save: vi.fn().mockResolvedValue({
        ...completed,
        evidence: { ...completed.evidence!, revision: 5 },
      }),
    };
    render(<LessonEvidenceWorkspace lessonId="lesson" context={context} gateway={evidenceGateway} onBack={onBack} />);

    await user.click(await screen.findByRole("button", { name: "Save and return to lessons" }));

    expect(evidenceGateway.save).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", expectedRevision: 4 }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Save without writing" })).not.toBeInTheDocument();
  });
});
