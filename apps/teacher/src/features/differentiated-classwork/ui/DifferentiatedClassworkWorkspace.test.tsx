import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DifferentiatedClassworkGateway } from "../application/DifferentiatedClassworkGateway";
import type { DifferentiatedClassworkWorkspaceSnapshot } from "../domain/differentiatedClasswork";
import { DifferentiatedClassworkWorkspace } from "./DifferentiatedClassworkWorkspace";

const context = { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" };
const baseBlocks = ["review", "worked_example", "practice", "solution"].map((kind, index) => ({
  id: `base-${index}`,
  kind: kind as "review" | "worked_example" | "practice" | "solution",
  text: `Original ${kind}`,
  learningGoalNumbers: [1],
  sourceMaterialKeys: ["source"], teacherEdited: false,
}));
const quality = {
  outcome: "passed" as const,
  repairAttempted: false,
  scrubbedClaimCount: 0,
  passes: [{
    stage: "initial" as const,
    passed: true,
    checks: ["content_structure", "learning_goal_preservation", "block_alignment", "source_scope", "differentiation_presence", "unsupported_claims"].map((check) => ({
      check: check as "content_structure",
      passed: true,
      details: [],
    })),
  }],
};

const completeWorkspace: DifferentiatedClassworkWorkspaceSnapshot = {
  lesson: {
    lessonId: "lesson", lessonVersionId: "version", lessonVersionNumber: 1,
    subject: "Mathematics", grade: "JSS 2", topic: "Linear equations", subtopic: null, learningGoals: ["Solve equations"],
  },
  readiness: { canStart: true, blockers: [] },
  run: {
    id: "run", taskId: "group-classwork-run", status: "complete", baseRunId: "base-run", evidenceSetId: "evidence", evidenceRevision: 2,
    groups: ["Bridge group", "Practice group", "Challenge group"].map((name, groupIndex) => ({
      id: `group-${groupIndex}`,
      evidenceGroupId: `evidence-group-${groupIndex}`,
      position: groupIndex + 1,
      name,
      learnerState: [{
        learningGoalNumber: 1, learningGoal: "Solve equations",
        masteryBand: groupIndex === 0 ? "remediate" : groupIndex === 1 ? "reinforce" : "extend",
        mastery: `${groupIndex + 1} of 3 exit-test questions correct`,
        confidence: null, perceivedDifficulty: null,
        commonMisunderstanding: groupIndex === 0 ? "Adds instead of subtracting" : null,
      }],
      sessionSignals: { interest: null, lessonFeeling: null },
      sections: [{
        id: `section-${groupIndex}`,
        baseSectionId: "base-section",
        sequence: 1,
        stepTitle: "Introduction",
        status: "done" as const,
        attemptCount: 1,
        lastError: null,
        title: "Keeping equations balanced",
        learningGoalNumbers: [1],
        quality,
        baseSection: {
          id: "base-section", sequence: 1, stepTitle: "Introduction",
          title: "Keeping equations balanced", learningGoalNumbers: [1], blocks: baseBlocks,
        },
        blocks: baseBlocks.map((block) => ({
          id: `${block.id}-${groupIndex}`,
          baseBlockId: block.id,
          kind: block.kind,
          text: `${name} ${block.kind}`,
          learningGoalNumbers: [1],
          sourceMaterialKeys: ["source"], teacherEdited: false,
        })),
      }],
    })),
  },
};

function gateway(snapshot: DifferentiatedClassworkWorkspaceSnapshot): DifferentiatedClassworkGateway {
  return {
    getWorkspace: vi.fn().mockResolvedValue(snapshot),
    runGeneration: vi.fn().mockResolvedValue(snapshot),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
  };
}

describe("DifferentiatedClassworkWorkspace", () => {
  it("shows block-by-block original and adjusted material with persistent group context", async () => {
    const user = userEvent.setup();
    render(
      <DifferentiatedClassworkWorkspace
        lessonId="lesson" context={context} gateway={gateway(completeWorkspace)} onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Keeping equations balanced" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Original Review" })).toHaveTextContent("Original review");
    expect(screen.getByRole("region", { name: "Review for Bridge group" })).toHaveTextContent("Bridge group review");
    expect(screen.getByText("Watch for: Adds instead of subtracting")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Challenge group/ }));
    expect(screen.getByText("Further challenge")).toBeVisible();
    expect(screen.getByRole("region", { name: "Review for Challenge group" })).toHaveTextContent("Challenge group review");
  });

  it("names each readiness tier and says what placed a group in it", async () => {
    const user = userEvent.setup();
    render(
      <DifferentiatedClassworkWorkspace
        lessonId="lesson" context={context} gateway={gateway(completeWorkspace)} onBack={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Keeping equations balanced" });
    expect(screen.getByText("More guided support")).toBeVisible();
    expect(
      screen.getByText(/Grouped here because fewer than half the exit-test questions were right\./),
    ).toBeVisible();
    expect(screen.getByText(/Each version is built from your class results/)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Challenge group/ }));
    expect(
      screen.getByText(/three quarters or more of the exit-test questions were right\./),
    ).toBeVisible();
  });

  it("explains unmet prerequisites and does not offer an active start action", async () => {
    const empty = {
      ...completeWorkspace,
      readiness: { canStart: false, blockers: ["Finish the class results for all three teaching groups."] },
      run: null,
    };
    render(
      <DifferentiatedClassworkWorkspace
        lessonId="lesson" context={context} gateway={gateway(empty)} onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText("Finish the class results for all three teaching groups.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create the group classwork" })).toBeDisabled();
  });

  it("hands a failed section back to the backend and shows the run continuing", async () => {
    const user = userEvent.setup();
    const failed = workspaceWithSectionStates(["failed", "pending", "done"], "failed");
    const allComplete = workspaceWithSectionStates(["done", "done", "done"], "complete");
    const runGeneration = vi.fn().mockResolvedValue(allComplete);
    const retryGateway: DifferentiatedClassworkGateway = {
      getWorkspace: vi.fn().mockResolvedValue(failed),
      runGeneration,
      cancelGeneration: vi.fn(),
    };
    render(
      <DifferentiatedClassworkWorkspace
        lessonId="lesson" context={context} gateway={retryGateway} onBack={vi.fn()}
      />,
    );

    await user.click((await screen.findAllByRole("button", { name: "Try this part again" }))[0]);

    expect(runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: "lesson", sectionId: "section-0" }),
    );
    expect(await screen.findByText("3 of 3 parts finished")).toBeVisible();
  });
});

function workspaceWithSectionStates(
  states: Array<"pending" | "generating" | "done" | "failed">,
  runStatus: "paused" | "running" | "failed" | "cancelled" | "complete",
): DifferentiatedClassworkWorkspaceSnapshot {
  return {
    ...completeWorkspace,
    run: {
      ...completeWorkspace.run!,
      status: runStatus,
      groups: completeWorkspace.run!.groups.map((group, index) => ({
        ...group,
        sections: group.sections.map((section) => ({
          ...section,
          status: states[index],
          lastError: states[index] === "failed" ? "The section did not pass its checks." : null,
          title: states[index] === "done" ? section.title : null,
          quality: states[index] === "done" ? section.quality : null,
          blocks: states[index] === "done" ? section.blocks : [],
        })),
      })),
    },
  };
}

