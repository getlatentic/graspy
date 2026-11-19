import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { SubjectIcon } from "@/features/learn/components/subject-icon";
import { SubjectPicture } from "@/features/learn/components/subject-picture";
import { subjectTintClasses } from "@/features/learn/lib/subject-icons";

interface SubjectTileProps {
  name: string;
  band?: AgeBand;
  onSelect: () => void;
}

const TILE =
  "flex h-full w-full overflow-hidden rounded-card border border-line bg-surface text-start shadow-card transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

/**
 * One tile, three builds: a child sees a tall picture over the name, a tween a
 * wider, shorter one over it, and a teen or university learner a line icon beside
 * it. A name such as "Mathematics" needs the tile's width, so only the icon sits beside.
 */
export function SubjectTile({
  name,
  band = "child",
  onSelect,
}: SubjectTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        TILE,
        band === "teen" ? "items-center gap-3 p-3" : "flex-col",
      )}
    >
      {band !== "teen" && (
        <SubjectPicture
          name={name}
          band={band}
          className={cn(
            "w-full",
            band === "child" ? "aspect-4/3" : "aspect-video",
          )}
        />
      )}
      {band === "teen" && (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-control",
            subjectTintClasses(name),
          )}
        >
          <SubjectIcon name={name} className="size-6" />
        </span>
      )}
      <span
        className={cn(
          "min-w-0 line-clamp-2 break-words text-sm font-semibold text-ink lg:text-base",
          band !== "teen" && "px-3 py-3",
        )}
      >
        {name}
      </span>
    </button>
  );
}
