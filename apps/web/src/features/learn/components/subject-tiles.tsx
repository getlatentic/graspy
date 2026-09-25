import { SubjectTile } from "@/features/learn/components/subject-tile";
import type { CurriculumSubject } from "@/lib/curriculum-record";

interface SubjectTilesProps {
  subjects: CurriculumSubject[];
  onSelect: (subject: CurriculumSubject) => void;
}

/** On a phone the next tile shows half in view, so the row reads as scrollable. */
export function SubjectTiles({ subjects, onSelect }: SubjectTilesProps) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0">
      {subjects.map((subject) => (
        <li key={subject.slug} className="w-24 shrink-0 snap-start sm:w-auto">
          <SubjectTile name={subject.name} onSelect={() => onSelect(subject)} />
        </li>
      ))}
    </ul>
  );
}
