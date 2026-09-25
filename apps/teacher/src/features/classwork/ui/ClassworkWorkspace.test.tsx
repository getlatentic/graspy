import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClassworkGateway } from "../application/ClassworkGateway";
import type { ClassworkSection, ClassworkWorkspaceSnapshot } from "../domain/classwork";
import { ClassworkWorkspace } from "./ClassworkWorkspace";

const context = { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" };
const lesson = { lessonId: "lesson", lessonVersionId: "version", lessonVersionNumber: 1, subject: "Mathematics", grade: "JSS 2", topic: "Equivalent fractions", subtopic: null, learningGoals: ["Compare equivalent fractions."] };
const quality = { outcome: "passed" as const, repairAttempted: false, scrubbedClaimCount: 0, passes: [{
  stage: "initial" as const,
  passed: true,
  checks: ["content_structure", "learning_goal_alignment", "scope_compliance", "source_presence", "source_validity", "unsupported_source_claims"].map((check) => ({
    check: check as "content_structure",
    passed: true,
    details: [],
  })),
}] };
const source = { key: "ch04-b014", title: "Equivalent fractions", text: "Equivalent fractions have the same value.", publisher: "Siyavula", sourceUrl: "https://ng.siyavula.com/read", licenceName: "Creative Commons Attribution 3.0 Unported", licenceUrl: "https://creativecommons.org/licenses/by/3.0/", attribution: "Siyavula Mathematics JSS 1, CC BY 3.0." };
const sourceSummary = { key: source.key, title: source.title, publisher: source.publisher, sourceUrl: source.sourceUrl, licenceName: source.licenceName, licenceUrl: source.licenceUrl, attribution: source.attribution };
const figure = { id: "figure", sourceMaterialKey: source.key, sequence: 1, caption: "Three equivalent fraction models.", altText: "Three rectangles divided into equal parts.", widthPx: 810, heightPx: 690 };
const pendingSection: ClassworkSection = { id: "section", sequence: 1, stepTitle: "Compare models", status: "pending", title: null, learningGoalNumbers: [], attemptCount: 0, lastError: null, quality: null, regenerated: false, blocks: [] };
const snapshot = (status: "paused" | "running" | "failed" | "cancelled" | "complete", section: ClassworkSection = pendingSection): ClassworkWorkspaceSnapshot => ({ lesson, run: { id: "run", taskId: "lesson-classwork-run", status, lessonVersionId: "version", lessonVersionNumber: 1, documentVersion: status === "complete" ? { id: "classwork-version", versionNumber: 1, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-30 10:00:00", approvedAt: null } : null, sources: [sourceSummary], figures: [figure], sections: [section] } });
const generated = { title: "Comparing fraction models", learningGoalNumbers: [1], blocks: [
  { kind: "review" as const, text: "Review", learningGoalNumbers: [1], sourceMaterialKeys: [source.key] },
  { kind: "worked_example" as const, text: "Example", learningGoalNumbers: [1], sourceMaterialKeys: [source.key] },
  { kind: "practice" as const, text: "Practice", learningGoalNumbers: [1], sourceMaterialKeys: [source.key] },
  { kind: "solution" as const, text: "Solution", learningGoalNumbers: [1], sourceMaterialKeys: [source.key] },
], quality };
const done = { ...pendingSection, status: "done" as const, title: generated.title, learningGoalNumbers: [1], attemptCount: 1, quality, blocks: generated.blocks.map((block, index) => ({ ...block, id: `block-${index}`, teacherEdited: false })) };

function withDocumentVersion(
  workspace: ClassworkWorkspaceSnapshot,
  versionNumber: number,
  status: "draft" | "approved",
  section: ClassworkSection,
): ClassworkWorkspaceSnapshot {
  return {
    ...workspace,
    run: workspace.run ? {
      ...workspace.run,
      documentVersion: {
        id: `classwork-version-${versionNumber}`,
        versionNumber,
        changeKind: "initial" as const,
        changedSectionId: null,
        teacherDirection: null,
        restoredFromVersionNumber: null,
        createdAt: "2026-07-30 10:00:00",
        status,
        approvedAt: status === "approved" ? "2026-07-18 05:00:00" : null,
      },
      sections: [section],
    } : null,
  };
}

function gateway(overrides: Partial<ClassworkGateway> = {}): ClassworkGateway {
  return {
    getWorkspace: vi.fn().mockResolvedValue({ lesson, run: null }),
    runGeneration: vi.fn().mockResolvedValue(snapshot("complete", done)),
    regenerateSection: vi.fn(),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
    getFigureData: vi.fn().mockResolvedValue("data:image/png;base64,dHJ1c3RlZA=="),
    editBlock: vi.fn(),
    approveVersion: vi.fn(),
    getSectionHistory: vi.fn(),
    restoreSection: vi.fn(),
    ...overrides,
  };
}

describe("ClassworkWorkspace", () => {
  it("asks the backend to create instructionalMaterials and renders what it saved", async () => {
    const user = userEvent.setup();
    const classworkGateway = gateway();
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={classworkGateway} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create the classwork" }));
    expect(await screen.findByRole("heading", { name: generated.title })).toBeVisible();
    expect(screen.getByText("1 of 1 parts finished")).toBeVisible();
    expect(screen.getByText("Quality checked")).toBeVisible();
    expect(await screen.findByRole("img", { name: figure.altText })).toBeVisible();
    expect(screen.getByRole("heading", { name: "How each activity connects" })).toBeVisible();
    expect(screen.getAllByText(/Equivalent fractions — Siyavula/u).length).toBeGreaterThan(0);
    expect(classworkGateway.runGeneration).toHaveBeenCalledWith({ context, lessonId: "lesson" });
  });

  /// "Materials" on a lesson plan means the chalk, charts and counters a
  /// teacher carries into the room — a line their school checks. The review,
  /// worked examples, practice and answers graspy writes are the classwork, and
  /// wearing the same word made one of them the wrong thing on a signed form.
  it("never calls the work it writes instructionalMaterials", async () => {
    const user = userEvent.setup();
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={gateway()} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create the classwork" }));
    await screen.findByRole("heading", { name: generated.title });

    expect(screen.queryAllByText(/\bmaterials\b/iu)).toEqual([]);
    expect(screen.getByText("Classwork")).toBeVisible();
  });

  it("says what the page will hold before anything has been made for it", async () => {
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={gateway()} onBack={vi.fn()} />);
    expect(
      await screen.findByRole("heading", { name: "Build from the lesson you confirmed." }),
    ).toBeVisible();
  });

  it("replaces that invitation with the instructionalMaterials once a section is saved", async () => {
    const user = userEvent.setup();
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={gateway()} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create the classwork" }));
    expect(await screen.findByRole("heading", { name: generated.title })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Build from the lesson you confirmed." }),
    ).not.toBeInTheDocument();
  });

  it("keeps a failed section attached to its own retry action", async () => {
    const user = userEvent.setup();
    const failed = snapshot("failed", { ...pendingSection, status: "failed", attemptCount: 1, lastError: "This section could not be created." });
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue(failed),
      runGeneration: vi.fn().mockResolvedValue(snapshot("complete", done)),
    });
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={classworkGateway} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Try this part again" }));
    expect(await screen.findByRole("heading", { name: generated.title })).toBeVisible();
    expect(classworkGateway.runGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ lessonId: "lesson", sectionId: "section" }),
    );
  });

  /// The state a teacher reported: one section interrupted before it saved,
  /// the rest still queued, and a run already going. The button was offered,
  /// and the backend could only refuse it with "These materials are already
  /// being worked on" — an error about the teacher's own work.
  it("does not offer to retry a failed section while a run is already going", async () => {
    const interrupted = { ...pendingSection, id: "section-1", sequence: 1, status: "failed" as const, attemptCount: 1, lastError: "Creation was interrupted before this section was saved." };
    const queued = { ...pendingSection, id: "section-2", sequence: 2, stepTitle: "Count in millions." };
    const running = snapshot("running");
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue({
        ...running,
        run: { ...running.run!, sections: [interrupted, queued] },
      }),
    });
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={classworkGateway} onBack={vi.fn()} />);

    expect(
      await screen.findByText("This section is waiting for the work already running."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try this part again" })).not.toBeInTheDocument();
    // The section's own reason still reaches the teacher; only the impossible
    // action is withheld.
    expect(screen.getByText("Creation was interrupted before this section was saved.")).toBeVisible();
    expect(classworkGateway.runGeneration).not.toHaveBeenCalled();
  });

  it("offers the retry again once nothing is running", async () => {
    const interrupted = { ...pendingSection, id: "section-1", sequence: 1, status: "failed" as const, attemptCount: 1, lastError: "Creation was interrupted before this section was saved." };
    const stopped = snapshot("cancelled");
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue({
        ...stopped,
        run: { ...stopped.run!, sections: [interrupted] },
      }),
    });
    render(<ClassworkWorkspace lessonId="lesson" context={context} gateway={classworkGateway} onBack={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Try this part again" })).toBeVisible();
  });

  it("edits one activity, marks it, and freezes the approved draft", async () => {
    const user = userEvent.setup();
    const initial = snapshot("complete", done);
    const editedSection = {
      ...done,
      blocks: done.blocks.map((block, index) => index === 0
        ? { ...block, text: "Compare one half and two quarters using fraction strips.", teacherEdited: true }
        : block),
    };
    const edited = withDocumentVersion(initial, 2, "draft", editedSection);
    const approved = withDocumentVersion(initial, 2, "approved", editedSection);
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue(initial),
      editBlock: vi.fn().mockResolvedValue(edited),
      approveVersion: vi.fn().mockResolvedValue(approved),
    });

    render(
      <ClassworkWorkspace
        lessonId="lesson"
        context={context}
        gateway={classworkGateway}
        onBack={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Edit review" }));
    const editor = await screen.findByRole("textbox", { name: "Edit Review" });
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}Compare one half and two quarters using fraction strips.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(classworkGateway.editBlock).toHaveBeenCalledWith({
      context,
      runId: "run",
      blockId: "block-0",
      expectedVersionNumber: 1,
      text: "Compare one half and two quarters using fraction strips.",
    });
    expect(await screen.findAllByText("Edited by you")).toHaveLength(2);
    expect(screen.getByText("Draft 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Review and approve" }));
    await user.click(screen.getByRole("button", { name: "Approve the classwork" }));

    expect(classworkGateway.approveVersion).toHaveBeenCalledWith({
      context,
      runId: "run",
      expectedVersionNumber: 2,
    });
    expect(await screen.findByText("Approved draft 2")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Edit /u })).not.toBeInTheDocument();
  });

  it("hands recreation to the backend with the teacher's direction", async () => {
    const user = userEvent.setup();
    const initial = snapshot("complete", done);
    const direction = "Use smaller numbers and explain the final check.";
    const generating: ClassworkWorkspaceSnapshot = {
      ...initial,
      run: initial.run ? {
        ...initial.run,
        sectionRegeneration: {
          id: "regeneration",
          sectionId: done.id,
          status: "generating",
          teacherDirection: direction,
          lastError: null,
        },
      } : null,
    };
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue(initial),
      regenerateSection: vi.fn().mockResolvedValue(generating),
    });

    render(
      <ClassworkWorkspace
        lessonId="lesson"
        context={context}
        gateway={classworkGateway}
        onBack={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Recreate section" }));
    await user.type(screen.getByRole("textbox", { name: "What should change? (optional)" }), direction);
    await user.click(screen.getAllByRole("button", { name: "Recreate section" })[1]);

    expect(classworkGateway.regenerateSection).toHaveBeenCalledWith({
      context,
      runId: "run",
      sectionId: "section",
      expectedVersionNumber: 1,
      teacherDirection: direction,
    });
    expect(await screen.findByText("Recreating this section")).toBeVisible();
  });

  it("restores a recreated section from its version history", async () => {
    const user = userEvent.setup();
    const direction = "Use smaller numbers and explain the final check.";
    const recreatedSection = {
      ...done,
      title: "Checking equivalent fractions",
      regenerated: true,
      blocks: done.blocks.map((block) => ({ ...block, text: `Recreated ${block.kind} text`, teacherEdited: false })),
    };
    const recreated = withDocumentVersion(snapshot("complete", done), 2, "draft", recreatedSection);
    const restored = withDocumentVersion(snapshot("complete", done), 3, "draft", done);
    const classworkGateway = gateway({
      getWorkspace: vi.fn().mockResolvedValue(recreated),
      getSectionHistory: vi.fn().mockResolvedValue({
        currentVersionNumber: 2,
        versions: [
          {
            versionNumber: 2,
            createdAt: "2026-07-18 06:00:00",
            changeKind: "section_regeneration",
            teacherDirection: direction,
            restoredFromVersionNumber: null,
            title: recreatedSection.title,
            learningGoalNumbers: [1],
            regenerated: true,
            blocks: recreatedSection.blocks,
          },
          {
            versionNumber: 1,
            createdAt: "2026-07-18 05:00:00",
            changeKind: "initial",
            teacherDirection: null,
            restoredFromVersionNumber: null,
            title: done.title,
            learningGoalNumbers: [1],
            regenerated: false,
            blocks: done.blocks,
          },
        ],
      }),
      restoreSection: vi.fn().mockResolvedValue(restored),
    });

    render(
      <ClassworkWorkspace
        lessonId="lesson"
        context={context}
        gateway={classworkGateway}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: recreatedSection.title })).toBeVisible();
    expect(screen.getByText("Recreated")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Version history" }));
    expect(await screen.findByRole("heading", { name: "Section version history" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === `Direction: ${direction}`)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restore this section" }));

    expect(classworkGateway.restoreSection).toHaveBeenCalledWith({
      context,
      runId: "run",
      sectionId: "section",
      sourceVersionNumber: 1,
      expectedVersionNumber: 2,
    });
    expect(await screen.findByText("Draft 3")).toBeVisible();
  });

  it("keeps current wording visible and locks competing draft actions during recreation", async () => {
    const initial = snapshot("complete", done);
    const generating: ClassworkWorkspaceSnapshot = {
      ...initial,
      run: initial.run ? {
        ...initial.run,
        sectionRegeneration: {
          id: "regeneration",
          sectionId: done.id,
          status: "generating",
          teacherDirection: null,
          lastError: null,
        },
      } : null,
    };

    render(
      <ClassworkWorkspace
        lessonId="lesson"
        context={context}
        gateway={gateway({ getWorkspace: vi.fn().mockResolvedValue(generating) })}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Recreating this section")).toBeVisible();
    const reviewBlock = screen.getByRole("heading", { name: "Review" }).closest("section");
    expect(reviewBlock).not.toBeNull();
    expect(reviewBlock?.querySelector(".classwork-content")).toHaveTextContent(done.blocks[0].text);
    expect(screen.queryByRole("button", { name: "Edit review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and approve" })).toBeDisabled();
    expect(screen.getByText("Finish or stop the section being recreated before approving this draft.")).toBeVisible();
  });
});
