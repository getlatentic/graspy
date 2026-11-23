import { Art } from "@/components/brand/art";
import { knownBand, type AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { useAgeBand } from "@/lib/use-age-band";
import { SubjectIcon } from "@/features/learn/components/subject-icon";
import { subjectArt } from "@/features/learn/lib/subject-art";
import { subjectTintClasses } from "@/features/learn/lib/subject-icons";

// Outline by band: bold for a child, medium for a tween, a hairline for a teen.
// A small picture takes the thinner step so the frame does not eat it.
const FRAME: Record<AgeBand, { full: string; small: string }> = {
  child: {
    full: "border-4 border-accent-line",
    small: "border-2 border-accent-line",
  },
  tween: { full: "border-2 border-line", small: "border border-line" },
  teen: { full: "border border-line", small: "border border-line" },
};

/**
 * The subject's learner picture for the learner's band, framed by the band's
 * outline; a subject with no picture shows its icon on a tinted square.
 * `frame="none"` leaves the outline to a card that already clips the picture.
 * `sizes` is the width it is shown at (see Art); `priority` is for the page's
 * largest paint.
 */
export function SubjectPicture({
  name,
  frame = "full",
  className,
  iconClassName = "size-12",
  sizes,
  priority,
}: {
  name: string;
  frame?: "full" | "small" | "none";
  className?: string;
  iconClassName?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const band = knownBand(useAgeBand());
  const art = subjectArt(name);
  return (
    <div
      data-subject-picture={art ? "art" : "icon"}
      className={cn(
        "aspect-square shrink-0 overflow-hidden",
        frame !== "none" && ["rounded-control", FRAME[band][frame]],
        subjectTintClasses(name),
        className,
      )}
    >
      {art ? (
        <Art
          name={art}
          band={band}
          sizes={sizes}
          priority={priority}
          className="picture-dim"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <SubjectIcon name={name} className={iconClassName} />
        </span>
      )}
    </div>
  );
}
