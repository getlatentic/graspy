import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import type { PreparationStepProgress } from "../../features/lesson-planning/domain/preparationProgress";
import { PreparationNarration } from "../../features/lesson-planning/ui/PreparationNarration";

const steps = [
  "learning-goals",
  "prior-knowledge",
  "checks",
  "source-material",
  "teaching-sequence",
  "practice",
  "putting-together",
] as const;

function at(running: number): readonly PreparationStepProgress[] {
  return steps.map((step, index) => ({
    step,
    state: index < running ? "done" : index === running ? "running" : "pending",
  }));
}

createRoot(document.getElementById("root")!).render(
  <div style={{ display: "grid", gap: "24px", padding: "24px", maxWidth: "560px" }}>
    <PreparationNarration progress={[]} onCancel={() => undefined} />
    <PreparationNarration progress={at(2)} onCancel={() => undefined} />
    <PreparationNarration
      progress={steps.map((step, index) => ({
        step,
        state: index === 5 ? "failed" : index < 5 ? "done" : "pending",
      }))}
      onCancel={() => undefined}
    />
  </div>,
);
