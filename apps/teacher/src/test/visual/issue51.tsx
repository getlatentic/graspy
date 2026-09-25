import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { LessonConfirmed } from "../../features/lesson-planning/ui/LessonConfirmed";

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <LessonConfirmed
    onCreateClasswork={() => undefined}
  />,
);
