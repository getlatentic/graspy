import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { StatusPill } from "../../ui/StatusPill";
import { LessonArtifactTabs } from "../../features/lesson-planning/ui/LessonArtifactTabs";
import { LessonSourceChips } from "../../features/lesson-planning/ui/LessonSourceChips";
import { referenceSources } from "../../features/lesson-planning/domain/lessonPlanning";
import type { StudentNote } from "../../features/lesson-planning/domain/studentNote";

const note: StudentNote = {
  writtenFromVersion: 1,
  paragraphs: [
    "A large number is easier to read when we group its digits in threes from the right. Each group has a name: units, thousands, millions, and billions.",
    "One million is a thousand thousands — written 1 000 000, with six zeros. One billion is a thousand millions — written 1 000 000 000, with nine zeros.",
    "To read 4 208 000 000, start from the left: 4 billion, 208 million. We say 'four billion, two hundred and eight million'.",
    "When we write these numbers, the spaces between groups help us keep the place values in line so we do not miscount the zeros.",
  ],
};

const references = ["Millions and billions, Siyavula Mathematics · CC BY 3.0"];
const objective = "Read and write whole numbers up to one billion.";

export function PlanFixture() {
  return (
    <>
      <section>
        <h3 className="m-0 mb-sm text-base text-ink">Learning goals</h3>
        <ul className="m-0 grid list-disc gap-xs ps-lg text-ink-secondary marker:text-brand">
          <li>Read whole numbers up to one billion.</li>
          <li>Write whole numbers up to one billion in figures and words.</li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-sm text-base text-ink">Lesson steps</h3>
        <ol className="m-0 grid list-none gap-lg p-0">
          <li className="grid grid-cols-[1.625rem_minmax(0,1fr)] items-start gap-x-md gap-y-2xs">
            <span className="grid size-[1.625rem] place-items-center rounded-[8px] bg-paper-accent text-sm font-bold text-brand" aria-hidden="true">1</span>
            <div className="flex min-w-0 items-baseline justify-between gap-md">
              <strong className="min-w-0 [overflow-wrap:anywhere]">Group the digits</strong>
              <span className="shrink-0 whitespace-nowrap text-sm text-muted">10 min</span>
            </div>
            <div className="col-span-2 grid gap-2xs">
              <p className="m-0 leading-body text-ink-secondary"><b>Teacher:</b> Model grouping a nine-digit number in threes.</p>
              <p className="m-0 leading-body text-ink-secondary"><b>Learners:</b> Group two numbers of their own.</p>
            </div>
          </li>
          <li className="grid grid-cols-[1.625rem_minmax(0,1fr)] items-start gap-x-md gap-y-2xs">
            <span className="grid size-[1.625rem] place-items-center rounded-[8px] bg-paper-accent text-sm font-bold text-brand" aria-hidden="true">2</span>
            <div className="flex min-w-0 items-baseline justify-between gap-md">
              <strong className="min-w-0 [overflow-wrap:anywhere]">Name the groups</strong>
              <span className="shrink-0 whitespace-nowrap text-sm text-muted">30 min</span>
            </div>
            <div className="col-span-2 grid gap-2xs">
              <p className="m-0 leading-body text-ink-secondary"><b>Teacher:</b> Introduce millions and billions.</p>
              <p className="m-0 leading-body text-ink-secondary"><b>Learners:</b> Read numbers aloud in groups.</p>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}

export function ReviewArticle({ withNote, stale = false }: { readonly withNote: boolean; readonly stale?: boolean }) {
  return (
    <article className="grid gap-xl">
      <header>
        <div className="flex items-start justify-between gap-md">
          <p className="m-0 mb-xs min-w-0 text-sm font-extrabold tracking-[0.01em] text-accent">Number and numeration</p>
          <StatusPill tone="positive">Confirmed</StatusPill>
        </div>
        <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">Millions and billions</h2>
        <p>Week 1</p>
        <LessonSourceChips objective={objective} source={referenceSources(references)[0] ?? null} />
      </header>
      <LessonArtifactTabs
        onExport={() => undefined}
      exportOutcome={null}
        note={{
          note: withNote ? note : null,
          hasPlan: true,
          generating: false,
          error: null,
          stale,
          onGenerate: () => undefined,
        }}
        plan={<PlanFixture />}
      />
    </article>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div style={{ display: "grid", gap: "40px", padding: "40px", maxWidth: "980px", margin: "0 auto" }}>
    <ReviewArticle withNote={true} />
    <ReviewArticle withNote={true} stale={true} />
    <ReviewArticle withNote={false} />
  </div>,
);
