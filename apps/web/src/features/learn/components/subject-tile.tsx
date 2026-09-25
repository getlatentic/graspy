import { cn } from "@/lib/cn";
import { SubjectIcon } from "@/features/learn/components/subject-icon";
import { subjectTintClasses } from "@/features/learn/lib/subject-icons";

interface SubjectTileProps {
  name: string;
  onSelect: () => void;
}

/** Stacked in a phone's narrow tile; side by side in a wider one, where a
    centred icon and name would leave the tile half empty. */
export function SubjectTile({ name, onSelect }: SubjectTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1 rounded-card px-1 py-2.5 text-center transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-16 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-3 sm:text-start lg:min-h-24 lg:gap-4 lg:px-5",
        subjectTintClasses(name),
      )}
    >
      <SubjectIcon name={name} className="size-6 shrink-0 lg:size-8" />
      <span className="line-clamp-2 text-xs leading-tight font-semibold text-ink sm:text-sm lg:text-base">
        {name}
      </span>
    </button>
  );
}
