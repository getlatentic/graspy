import { cn } from "@/lib/cn";
import type { AgeBand } from "@/lib/age-band";
import { SubjectTile } from "@/features/learn/components/subject-tile";
import type { CurriculumSubject } from "@/lib/curriculum-record";

interface SubjectTilesProps {
  subjects: CurriculumSubject[];
  band: AgeBand;
  onSelect: (subject: CurriculumSubject) => void;
}

/** Two tiles across on a phone. Child tiles stack a picture, so four fit from sm; beside the Home rail from lg there is room for two, and for four from xl. The side-by-side builds need the width, so four only from xl. */
export function SubjectTiles({ subjects, band, onSelect }: SubjectTilesProps) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3",
        band === "child"
          ? "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"
          : "lg:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {subjects.map((subject) => (
        <li key={subject.slug}>
          <SubjectTile
            name={subject.name}
            band={band}
            onSelect={() => onSelect(subject)}
          />
        </li>
      ))}
    </ul>
  );
}
