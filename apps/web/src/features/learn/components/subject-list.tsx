import { ChevronRight } from "lucide-react";
import { SubjectPicture } from "@/features/learn/components/subject-picture";
import { useAgeBand } from "@/lib/use-age-band";
import { ProgressBar } from "@/components/ui/progress";
import type { CurriculumSubject } from "@/lib/curriculum-record";

export interface SubjectRowData {
  subject: CurriculumSubject;
  nextTopic: string | null;
  completed: number;
  total: number;
}

interface SubjectListProps {
  rows: SubjectRowData[];
  progressLabel: (completed: number, total: number) => string;
  onSelect: (subject: CurriculumSubject) => void;
}

export function SubjectList({
  rows,
  progressLabel,
  onSelect,
}: SubjectListProps) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.subject.slug}>
          <SubjectRow
            row={row}
            progressLabel={progressLabel}
            onSelect={() => onSelect(row.subject)}
          />
        </li>
      ))}
    </ul>
  );
}

interface SubjectRowProps {
  row: SubjectRowData;
  progressLabel: (completed: number, total: number) => string;
  onSelect: () => void;
}

function SubjectRow({ row, progressLabel, onSelect }: SubjectRowProps) {
  const { subject, nextTopic, completed, total } = row;
  const band = useAgeBand();
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-4 text-start transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4 sm:px-5"
    >
      <SubjectPicture
        name={subject.name}
        band={band}
        frame="small"
        className="size-12 sm:size-14"
        iconClassName="size-6"
      />

      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{subject.name}</span>
        {nextTopic && (
          <span className="mt-0.5 block truncate text-sm text-muted">
            {nextTopic}
          </span>
        )}
        {completed > 0 && total > 0 && (
          <ProgressBar
            percent={(completed / total) * 100}
            label=""
            className="mt-2"
          />
        )}
      </span>

      {total > 0 && (
        <span className="nums shrink-0 whitespace-nowrap text-sm font-semibold text-muted">
          <span aria-hidden="true" dir="ltr">
            {completed} / {total}
          </span>
          <span className="sr-only">{progressLabel(completed, total)}</span>
        </span>
      )}
      <ChevronRight
        className="hidden size-4 shrink-0 text-muted sm:block rtl:rotate-180"
        aria-hidden="true"
      />
    </button>
  );
}
