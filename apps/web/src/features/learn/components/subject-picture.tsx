import { Art } from "@/components/brand/art";
import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
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
 */
export function SubjectPicture({
  name,
  band = "child",
  frame = "full",
  className,
  iconClassName = "size-12",
}: {
  name: string;
  band?: AgeBand;
  frame?: "full" | "small" | "none";
  className?: string;
  iconClassName?: string;
}) {
  const art = subjectArt(name);
  return (
    <div
      className={cn(
        "aspect-square shrink-0 overflow-hidden",
        frame !== "none" && ["rounded-control", FRAME[band][frame]],
        subjectTintClasses(name),
        className,
      )}
    >
      {art ? (
        <Art name={art} band={band} className="dark:brightness-90" />
      ) : (
        <span className="flex size-full items-center justify-center">
          <SubjectIcon name={name} className={iconClassName} />
        </span>
      )}
    </div>
  );
}
