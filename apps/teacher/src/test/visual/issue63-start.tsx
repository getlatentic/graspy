import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { LessonList } from "../../features/lesson-planning/ui/LessonList";
import { StartLessonPanel } from "../../features/lesson-planning/ui/StartLessonPanel";

/* A class with nothing planned yet: the list states its own empty case beside
 * the choices for starting the first lesson, in the layout WeekScreen composes. */

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto w-[min(100%,72rem)] px-lg py-xl">
    <div className="grid min-w-0 gap-lg min-[60rem]:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <LessonList
        lessons={[]}
        currentWeek={null}
        selectedLessonId={null}
        planningKey={null}
        onSelect={() => undefined}
      />
      <section aria-live="polite">
        <StartLessonPanel
          onStartBlank={() => undefined}
          onDraftWithGraspy={() => undefined}
          onBringYourOwn={() => undefined}
        />
      </section>
    </div>
  </div>,
);
