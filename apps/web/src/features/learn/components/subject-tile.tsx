import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { SubjectPicture } from "@/features/learn/components/subject-picture";

interface SubjectTileProps {
  name: string;
  band?: AgeBand;
  onSelect: () => void;
}

const TILE =
  "flex h-full w-full overflow-hidden rounded-card bg-surface text-start shadow-card transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

// The tile's outline follows the band, like the picture's own frame.
const OUTLINE: Record<AgeBand, string> = {
  child: "border-4 border-accent-line",
  tween: "border-2 border-line",
  teen: "border border-line",
};

/**
 * One tile, three builds: a child sees a tall picture over the name, a tween a
 * wider, shorter one over it, and a teen or university learner a small picture
 * beside it. A name such as "Mathematics" needs the tile's width, so only the
 * small picture sits beside.
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
        OUTLINE[band],
        band === "teen" ? "items-center gap-3 p-3" : "flex-col",
      )}
    >
      {band === "teen" ? (
        <SubjectPicture
          name={name}
          band={band}
          frame="small"
          className="size-12"
          iconClassName="size-6"
        />
      ) : (
        <SubjectPicture
          name={name}
          band={band}
          frame="none"
          className={cn(
            "w-full",
            band === "child" ? "aspect-4/3" : "aspect-video",
          )}
        />
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
