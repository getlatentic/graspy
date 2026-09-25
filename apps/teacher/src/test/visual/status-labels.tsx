import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import { StatusPill, type StatusTone } from "../../ui/StatusPill";

/* Every status the product shows, in the three container shapes it shows them
 * in. The measurement that matters here is geometry and tab order, which the
 * jsdom suite cannot see. */

const statuses: readonly {
  readonly label: string;
  readonly tone: StatusTone;
  readonly size: "sm" | "md";
}[] = [
  { label: "Confirmed", tone: "positive", size: "md" },
  { label: "Approved", tone: "positive", size: "md" },
  { label: "Finished", tone: "positive", size: "md" },
  { label: "Quality checked", tone: "positive", size: "sm" },
  { label: "Publisher verified", tone: "positive", size: "md" },
  { label: "Source image", tone: "positive", size: "sm" },
  { label: "Active", tone: "information", size: "md" },
  { label: "Teaching week", tone: "information", size: "md" },
  { label: "Edited by you", tone: "information", size: "sm" },
  { label: "Recreated", tone: "information", size: "sm" },
  { label: "Adjusted", tone: "information", size: "md" },
  { label: "Goal 1", tone: "information", size: "sm" },
  { label: "Improved automatically", tone: "information", size: "sm" },
  { label: "Source wording adjusted", tone: "information", size: "sm" },
  { label: "Needs attention", tone: "attention", size: "sm" },
  { label: "Draft", tone: "neutral", size: "md" },
  { label: "Draft saved", tone: "neutral", size: "md" },
  { label: "Archived", tone: "neutral", size: "md" },
  { label: "Kept", tone: "neutral", size: "md" },
  { label: "Break week", tone: "neutral", size: "md" },
  { label: "Included with graspy", tone: "neutral", size: "md" },
  { label: "Added by your school", tone: "neutral", size: "md" },
  { label: "No plan yet", tone: "pending", size: "sm" },
];

function pill({ label, tone, size }: (typeof statuses)[number], className?: string) {
  return <StatusPill tone={tone} size={size} className={className}>{label}</StatusPill>;
}

/** Every screen that titles a thing and states its status beside the title. */
export function TitleRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-md border-b border-rule bg-paper p-md last:border-b-0">
      <div className="min-w-0">
        <p className="m-0 mb-xs text-sm font-extrabold tracking-[0.01em] text-accent">Number and numeration</p>
        <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">
          Millions and billions
        </h2>
        <p className="m-0 text-sm text-ink-secondary">{label}</p>
      </div>
      {children}
    </header>
  );
}

/** The lesson list, where the row carrying the status is itself the button. */
export function LessonRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-sm gap-y-[5px] border-0 border-b border-rule bg-transparent px-[20px] py-[14px] text-start text-ink last:border-b-0 focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2"
    >
      <strong className="col-start-1 row-start-1 text-md font-semibold [overflow-wrap:anywhere]">
        Millions and billions
      </strong>
      <span className="col-span-full row-start-2 text-sm text-ink-secondary">Week 1 · {label}</span>
      {children}
    </button>
  );
}

/** The placement LessonList gives its status inside the row's grid. */
const inLessonRow = "col-start-2 row-start-1 self-center justify-self-end";

/** A block header, where the status shares a wrapping row with the actions. */
export function ActionRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-xs border-b border-rule bg-paper p-md last:border-b-0">
      <h3 className="m-0 font-body text-base font-extrabold text-accent">Worked example</h3>
      {children}
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

const shapes = [
  { title: "Beside a title", Row: TitleRow, pillClass: "" },
  { title: "Inside a lesson row that is a button", Row: LessonRow, pillClass: inLessonRow },
  { title: "Among the actions of a block", Row: ActionRow, pillClass: "" },
];

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto grid max-w-[68rem] gap-xl p-lg">
    {shapes.map(({ title, Row, pillClass }) => (
      <section key={title}>
        <h1 className="m-0 mb-md font-display text-lg font-extrabold text-ink">{title}</h1>
        <div className="border border-rule-strong">
          {statuses.map((status) => (
            <Row key={status.label} label={status.label}>{pill(status, pillClass)}</Row>
          ))}
        </div>
      </section>
    ))}
  </div>,
);
