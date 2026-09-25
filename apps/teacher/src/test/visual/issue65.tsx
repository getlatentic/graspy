import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { LessonPreparationScreen } from "../../features/lesson-planning/ui/LessonPreparationScreen";
import type { PreparationStepProgress } from "../../features/lesson-planning/domain/preparationProgress";

// No cast: the step names are a closed set, and letting the compiler check
// them here is what catches a fixture inventing one.
const progress: PreparationStepProgress[] = [
  { step: "learning-goals", state: "done" },
  { step: "prior-knowledge", state: "done" },
  { step: "checks", state: "done" },
  { step: "source-material", state: "running" },
  { step: "teaching-sequence", state: "pending" },
  { step: "practice", state: "pending" },
  { step: "putting-together", state: "pending" },
];

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="grid gap-3xl">
    <LessonPreparationScreen
      topic="Ordering fractions"
      weekOrdinal={3}
      state={{ status: "preparing", lessonId: "lesson-1", progress }}
      onBackToWeek={() => undefined}
      onStop={() => undefined}
      onPrepareAgain={() => undefined}
    />
    <LessonPreparationScreen
      topic="Ordering fractions"
      weekOrdinal={3}
      state={{
        status: "failed",
        lessonId: "lesson-1",
        message:
          "graspy could not complete this lesson on this attempt. Try preparing it again, or edit the learning goals and try once more.",
      }}
      onBackToWeek={() => undefined}
      onStop={() => undefined}
      onPrepareAgain={() => undefined}
    />
  </div>,
);
