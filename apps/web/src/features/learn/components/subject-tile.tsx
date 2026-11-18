import type { AgeBand } from "@/lib/age-band";
import { SubjectPicture } from "@/features/learn/components/subject-picture";

interface SubjectTileProps {
  name: string;
  band?: AgeBand;
  onSelect: () => void;
}

/** A picture over the subject's name, like the lesson tiles of the voice Home. */
export function SubjectTile({ name, band, onSelect }: SubjectTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-full w-full flex-col overflow-hidden rounded-card border border-line bg-surface text-start shadow-card transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      <SubjectPicture name={name} band={band} className="w-full" />
      <span className="line-clamp-2 px-3 py-3 text-sm font-semibold text-ink lg:text-base">
        {name}
      </span>
    </button>
  );
}
