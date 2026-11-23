import { cn } from "@/lib/cn";
import { useAgeBand } from "@/lib/use-age-band";
import { SubjectTile } from "@/features/learn/components/subject-tile";
import type { CurriculumSubject } from "@/lib/curriculum-record";

interface SubjectTilesProps {
  subjects: CurriculumSubject[];
  onSelect: (subject: CurriculumSubject) => void;
}

/** Two tiles across on a phone. Child tiles stack a picture, so four fit from sm; beside the Home rail from lg there is room for two, and for four from xl. A teen tile puts its icon beside the name and needs the width, so four only from 2xl. */
export function SubjectTiles({ subjects, onSelect }: SubjectTilesProps) {
  const band = useAgeBand();
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3",
        band === "teen"
          ? "lg:grid-cols-2 2xl:grid-cols-4"
          : "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {subjects.map((subject) => (
        <li key={subject.slug}>
          <SubjectTile name={subject.name} onSelect={() => onSelect(subject)} />
        </li>
      ))}
    </ul>
  );
}
