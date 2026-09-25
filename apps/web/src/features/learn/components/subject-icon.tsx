import { cn } from "@/lib/cn";
import {
  subjectIcon,
  subjectTintClasses,
} from "@/features/learn/lib/subject-icons";

interface SubjectIconProps {
  name: string;
  className?: string;
}

export function SubjectIcon({ name, className }: SubjectIconProps) {
  const Icon = subjectIcon(name);
  return <Icon className={className} aria-hidden="true" />;
}

export function SubjectBadge({
  name,
  className,
  iconClassName = "size-5",
}: SubjectIconProps & { iconClassName?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        subjectTintClasses(name),
        className,
      )}
    >
      <SubjectIcon name={name} className={iconClassName} />
    </span>
  );
}
