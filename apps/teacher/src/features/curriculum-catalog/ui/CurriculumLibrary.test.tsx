import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TeachingAssignment } from "../../academic-workspace/domain/academicWorkspace";
import type { CurriculumCatalogSnapshot } from "../domain/curriculumCatalog";
import { CurriculumCoursePicker, CurriculumLibrary } from "./CurriculumLibrary";

const assignment: TeachingAssignment = {
  id: "assignment-1",
  academicSessionId: "session-1",
  subjectId: "subject-mathematics",
  subject: "Mathematics",
  gradeLevelId: "grade-jss-1",
  gradeLevel: "JSS 1",
  classSection: "A",
  displayName: "Mathematics · JSS 1 · A",
  curriculumCourseId: null,
  curriculumTitle: null,
  curriculumPublisher: null,
  curriculumTrust: null,
  status: "active",
  lessonsTotal: 0,
  lessonsReady: 0,
};

const catalog: CurriculumCatalogSnapshot = {
  packages: [
    {
      id: "package-1",
      title: "Basic education curriculum",
      publisher: "Curriculum office",
      jurisdictionId: "jurisdiction-ng",
      jurisdiction: "Nigeria",
      edition: "2026",
      rightsName: "Creative Commons Attribution 4.0",
      attribution: "Curriculum office, CC BY 4.0.",
      trust: "verified",
      origin: "imported",
      installedAt: "2026-07-18 10:00:00",
      earlierVersionsKept: 0,
    },
  ],
  courses: [
    {
      id: "course-1",
      packageId: "package-1",
      jurisdictionId: "jurisdiction-ng",
      framework: "Basic education curriculum",
      subjectId: "subject-mathematics",
      subject: "Mathematics",
      gradeLevelId: "grade-jss-1",
      gradeLevel: "JSS 1",
      title: "Mathematics · JSS 1",
      publisher: "Curriculum office",
      edition: "2026",
      trust: "verified",
    },
  ],
};

describe("CurriculumLibrary", () => {
  it("identifies a bundled unsigned curriculum without calling it publisher verified", () => {
    render(
      <CurriculumLibrary
        catalog={{
          ...catalog,
          packages: [
            {
              ...catalog.packages[0],
              publisher: "Graspy",
              trust: "school",
              origin: "bundled",
            },
          ],
        }}
        installing={false}
        error={null}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText("Included with graspy")).toBeInTheDocument();
    expect(screen.queryByText("Publisher verified")).not.toBeInTheDocument();
  });

  it("reads and submits the selected curriculum file", async () => {
    const onInstall = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <CurriculumLibrary
        catalog={{ packages: [], courses: [] }}
        installing={false}
        error={null}
        onInstall={onInstall}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["curriculum contents"], "maths.graspy-curriculum", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("curriculum contents"),
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onInstall).toHaveBeenCalledWith("curriculum contents"));
  });

  it("requires an explicit save after choosing a compatible course", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn().mockResolvedValue(true);
    render(
      <CurriculumCoursePicker
        assignment={assignment}
        catalog={catalog}
        pending={false}
        onAssign={onAssign}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Curriculum"), "course-1");
    await user.click(screen.getByRole("button", { name: "Use curriculum" }));

    expect(onAssign).toHaveBeenCalledWith("course-1");
  });

  it("says an earlier version is kept, rather than listing the curriculum twice", () => {
    render(
      <CurriculumLibrary
        catalog={{
          ...catalog,
          packages: [{ ...catalog.packages[0], earlierVersionsKept: 1 }],
        }}
        installing={false}
        error={null}
        onInstall={vi.fn()}
      />,
    );

    // One row, not two. The same curriculum listed twice with nothing to tell
    // the rows apart reads as a fault rather than as a version kept on purpose.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByText("An earlier version is kept for lessons that already use it."),
    ).toBeVisible();
  });
});
