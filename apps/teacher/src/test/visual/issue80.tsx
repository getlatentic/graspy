import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { BackgroundTaskStore } from "../../features/background-tasks/application/BackgroundTaskStore";
import type { BackgroundTaskGateway } from "../../features/background-tasks/application/BackgroundTaskGateway";
import type { BackgroundTask } from "../../features/background-tasks/domain/backgroundTask";
import { RunningTaskBar } from "../../features/background-tasks/ui/RunningTaskBar";
import type { ActiveAcademicContext } from "../../features/academic-workspace/ui/AcademicWorkspaceShell";

const tasks: BackgroundTask[] = [
  {
    id: "task-2", kind: "lesson_preparation", lessonId: "lesson-2",
    label: "Preparing Millions and billions", status: "running", queuePosition: null,
    failureMessage: null, startedAt: "2026-07-24 10:02:00",
    updatedAt: "2026-07-24 10:02:00", finishedAt: null,
    dismissedAt: null,
  },
  {
    id: "task-1", kind: "lesson_preparation", lessonId: "lesson-1",
    label: "Preparing Equivalent fractions", status: "interrupted", queuePosition: null,
    failureMessage: null, startedAt: "2026-07-24 09:40:00",
    updatedAt: "2026-07-24 09:41:00", finishedAt: null,
    dismissedAt: null,
  },
  {
    id: "task-3", kind: "classwork", lessonId: "lesson-3",
    label: "Creating classwork — Ordering fractions", status: "queued", queuePosition: 2,
    failureMessage: null, startedAt: "2026-07-24 10:03:00",
    updatedAt: "2026-07-24 10:03:00", finishedAt: null,
    dismissedAt: null,
  },
  {
    id: "task-0", kind: "classwork", lessonId: "lesson-1",
    label: "Building slides and quick check — Equivalent fractions", status: "interrupted", queuePosition: null,
    failureMessage: null, startedAt: "2026-07-24 09:35:00",
    updatedAt: "2026-07-24 09:36:00", finishedAt: null,
    dismissedAt: null,
  },
];

const gateway: BackgroundTaskGateway = {
  list: () => Promise.resolve(tasks),
  get: () => Promise.resolve(null),
  cancel: () => Promise.resolve(),
  dismiss: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  onChanged: () => Promise.resolve(() => undefined),
};

const academicContext = {
  workspace: { activeSessionId: "session-1" },
  sessionLabel: "2026/2027",
  period: { id: "period-1", name: "First term" },
  assignment: { id: "assignment-1", displayName: "Mathematics · JSS 2" },
} as unknown as ActiveAcademicContext;

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <MemoryRouter>
    <div style={{ padding: "40px", minHeight: "100vh" }}>
      <h1 style={{ font: "300 34px 'IBM Plex Sans'", color: "#12232e" }}>Plan my term</h1>
      <p style={{ color: "#5a6672" }}>
        The teacher has walked away from a lesson graspy is writing. The work carries on,
        and the bar takes them back to it.
      </p>
      <RunningTaskBar store={new BackgroundTaskStore(gateway)} academicContext={academicContext} />
    </div>
  </MemoryRouter>,
);
