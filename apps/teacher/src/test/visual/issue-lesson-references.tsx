import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { ReferencesSection } from "../../features/lesson-planning/ui/LessonReviewSections";

// Exactly what the bundled corpus produces: one shared attribution repeated on
// every excerpt, and Exercise 1.9 cited five times over. The lesson should name
// the book once rather than list eleven excerpt titles.
const attribution =
  "Siyavula Mathematics JSS 1, from https://ng.siyavula.com/read, licensed under Creative Commons Attribution 3.0 Unported. Processed into structured excerpts by graspy; formatting and segmentation changed.";
const cite = (title: string) => `${title} — ${attribution}`;
const references = [
  cite("Counting up to one billion"),
  cite("Exercise 1.8: Count with large numbers"),
  cite("Counting in millions and billions"),
  cite("Worked example 1.5: Writing a mixture of digits and words in digits only"),
  cite("Exercise 1.9: Express a mixture of digits and words in digits only"),
  cite("Exercise 1.9: Express a mixture of digits and words in digits only"),
  cite("Exercise 1.9: Express a mixture of digits and words in digits only"),
  cite("Exercise 1.9: Express a mixture of digits and words in digits only"),
  cite("Exercise 1.9: Express a mixture of digits and words in digits only"),
  cite("Exercise 1.10: Count in millions and billions"),
];

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto w-[min(100%,48rem)] px-lg py-xl">
    {/* The pairing LessonDetail sets it in: references beside instructional materials, each
        taking half the width where there is room for two columns. */}
    <div className="grid gap-lg border-b border-rule pb-lg sm:grid-cols-2">
      <ReferencesSection references={references} />
    </div>
  </div>,
);
