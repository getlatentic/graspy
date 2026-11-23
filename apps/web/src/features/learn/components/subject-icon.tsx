import { subjectIcon } from "@/features/learn/lib/subject-icons";

interface SubjectIconProps {
  name: string;
  className?: string;
}

/** The line icon of a subject with no learner picture. */
export function SubjectIcon({ name, className }: SubjectIconProps) {
  const Icon = subjectIcon(name);
  return <Icon className={className} aria-hidden="true" />;
}
