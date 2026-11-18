import { Art } from "@/components/brand/art";
import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { SubjectIcon } from "@/features/learn/components/subject-icon";
import { subjectArt } from "@/features/learn/lib/subject-art";
import { subjectTintClasses } from "@/features/learn/lib/subject-icons";

/** The subject's learner picture, or its icon on a tinted square. */
export function SubjectPicture({
  name,
  band = "child",
  className,
  iconClassName = "size-12",
}: {
  name: string;
  band?: AgeBand;
  className?: string;
  iconClassName?: string;
}) {
  const art = subjectArt(name);
  return (
    <div
      className={cn(
        "aspect-square overflow-hidden",
        subjectTintClasses(name),
        className,
      )}
    >
      {art ? (
        <Art name={art} band={band} />
      ) : (
        <span className="flex size-full items-center justify-center">
          <SubjectIcon name={name} className={iconClassName} />
        </span>
      )}
    </div>
  );
}
