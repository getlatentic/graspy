import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { LessonContent } from "../../features/lesson-planning/domain/lessonContent";
import { EditableLesson } from "../../features/lesson-planning/ui/EditableLesson";

/** A lesson with one of everything, so each part is on screen at once. */
const written: LessonContent = {
  objectives: ["Order fractions with unlike denominators", "Explain why the order holds"],
  instructionalMaterials: ["Fraction strips", "Board and markers"],
  steps: [
    {
      id: "step-1",
      title: "Compare two halves",
      durationMinutes: 12,
      summary: "Bring the class to a common denominator before comparing.",
      blocks: [
        { id: "b-1", type: "explanation", content: "Two fractions can only be compared once they name parts of the same size." },
        { id: "b-2", type: "worked_example", problem: "Order 1/2 and 2/5 from smallest to largest.", steps: [], finalAnswer: "2/5, 1/2" },
        { id: "b-3", type: "practice", question: "Order 3/4 and 5/8 from smallest to largest.", expectedAnswer: "5/8, 3/4", hints: [] },
      ],
    },
    { id: "step-2", title: "Practise together", durationMinutes: 8, summary: "", blocks: [] },
  ],
  checks: [
    { id: "c-1", question: "Order 2/3, 1/2 and 5/6 from smallest to largest.", expectedAnswer: "1/2, 2/3, 5/6" },
    { id: "c-2", question: "Why must denominators match before comparing?", expectedAnswer: "The parts must be the same size." },
  ],
};

export function Page() {
  const [content, setContent] = useState(written);
  return <EditableLesson content={content} onChange={setContent} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(<Page />);
