import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import type { AcademicWorkspaceSnapshot } from "../../features/academic-workspace/domain/academicWorkspace";
import { AcademicHeader } from "../../features/academic-workspace/ui/AcademicHeader";
import { AboutYou } from "../../features/academic-workspace/ui/AboutYou";
import { CurriculumRequired } from "../../features/curriculum-catalog/ui/CurriculumLibrary";

const snapshot: AcademicWorkspaceSnapshot = {
  workspace: null,
  subjects: [
    { id: "subject-mathematics", name: "Mathematics" },
    { id: "subject-english", name: "English Language" },
  ],
  gradeLevels: [
    { id: "grade-jss-1", gradeSystemId: "grade-system-ng", code: "JSS1", displayName: "JSS 1" },
    { id: "grade-jss-2", gradeSystemId: "grade-system-ng", code: "JSS2", displayName: "JSS 2" },
    { id: "grade-us-7", gradeSystemId: "grade-system-us", code: "US-7", displayName: "Grade 7" },
    { id: "grade-us-8", gradeSystemId: "grade-system-us", code: "US-8", displayName: "Grade 8" },
  ],
  jurisdictions: [
    { id: "jurisdiction-ng", countryCode: "NG", country: "Nigeria", name: "Nigeria" },
    { id: "jurisdiction-us", countryCode: "US", country: "United States", name: "United States" },
  ],
  gradeSystems: [
    { id: "grade-system-ng", jurisdictionId: "jurisdiction-ng", name: "Nigerian basic and secondary education", version: "1" },
    { id: "grade-system-us", jurisdictionId: "jurisdiction-us", name: "United States K–12", version: "1" },
  ],
};

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");

const assignment = {
  id: "assignment-mathematics-jss1-a",
  academicSessionId: "session-2026",
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
  status: "active" as const,
  lessonsTotal: 0,
  lessonsReady: 0,
};
const workspace = {
  school: {
    jurisdictionId: "jurisdiction-ng",
    jurisdiction: "Nigeria",
    countryCode: "NG",
    gradeSystemId: "grade-system-ng",
    gradeSystem: "Nigerian basic and secondary education",
  },
  sessions: [{
    id: "session-2026",
    startYear: 2026,
    endYear: 2027,
    label: "2026/2027",
    calendarKind: "terms" as const,
    status: "open" as const,
  }],
  periods: [{
    id: "period-first",
    academicSessionId: "session-2026",
    ordinal: 1,
    name: "First term",
    kind: "term" as const,
  }],
  assignments: [assignment],
  activeSessionId: "session-2026",
  activePeriodId: "period-first",
  activeAssignmentId: assignment.id,
};
const curriculumCatalog = {
  packages: [{
    id: "package-ng-2026",
    title: "Nigeria Basic Education Mathematics",
    publisher: "Curriculum Office",
    jurisdictionId: "jurisdiction-ng",
    jurisdiction: "Nigeria",
    edition: "2026",
    rightsName: "Creative Commons Attribution 4.0",
    attribution: "Curriculum Office, CC BY 4.0.",
    trust: "verified" as const,
    origin: "imported" as const,
    installedAt: "2026-07-18 10:00:00",
    earlierVersionsKept: 0,
  }],
  courses: [{
    id: "course-mathematics-jss1",
    packageId: "package-ng-2026",
    jurisdictionId: "jurisdiction-ng",
    framework: "Nigeria Basic Education Mathematics",
    subjectId: "subject-mathematics",
    subject: "Mathematics",
    gradeLevelId: "grade-jss-1",
    gradeLevel: "JSS 1",
    title: "Mathematics · JSS 1",
    publisher: "Curriculum Office",
    edition: "2026",
    trust: "verified" as const,
  }],
};

const curriculumView = new URLSearchParams(window.location.search).get("view") === "curriculum";

createRoot(root).render(
  <MemoryRouter>
  <div className="flex min-h-dvh w-full max-w-full flex-col bg-canvas text-ink [--app-header-block-size:calc(var(--app-header-bar-block-size)+3.25rem)]">
    <AcademicHeader workspace={curriculumView ? workspace : undefined} />
    {curriculumView ? (
      <CurriculumRequired
        assignment={assignment}
        catalog={curriculumCatalog}
        installing={false}
        error={null}
        assigning={false}
        onInstall={async () => true}
        onAssign={async () => true}
      />
    ) : (
      <AboutYou
        snapshot={snapshot}
        pending={false}
        error={null}
        onCreate={async () => true}
      />
    )}
  </div>
  </MemoryRouter>,
);
