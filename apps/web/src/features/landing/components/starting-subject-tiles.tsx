import { SubjectTile } from "@/features/learn/components/subject-tile";
import { STARTING_SUBJECTS } from "@/features/onboarding/lib/starting-subjects";

export function StartingSubjectTiles({
  onPick,
}: {
  onPick: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:gap-3">
      {STARTING_SUBJECTS.map(({ id, label }) => (
        <li key={id}>
          <SubjectTile name={label} onSelect={() => onPick(id)} />
        </li>
      ))}
    </ul>
  );
}
