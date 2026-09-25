/**
 * The stored display name is "subject · grade [· section]", already resolved so
 * a section that only repeats the grade is dropped. These read the two parts the
 * design shows separately — the class (grade, with a distinct section merged in,
 * so "JSS 1 · B" reads "JSS 1B") and the subject.
 */
export function splitAssignment(displayName: string): {
  readonly subject: string;
  readonly classLabel: string;
} {
  const [subject = "", grade, section] = displayName.split(" · ");
  const classLabel = section ? `${grade}${section}` : (grade ?? "");
  return { subject, classLabel };
}

/** The class-first single line the workspace bar shows: "JSS 1 · Mathematics". */
export function classFirstLabel(displayName: string | undefined): string {
  if (!displayName) return "";
  const { subject, classLabel } = splitAssignment(displayName);
  return classLabel ? `${classLabel} · ${subject}` : subject;
}
