const MAX_TEXT = 40;

/** A short name for an element in the log: its tag, role and what a person would read on it. */
export function describeElement(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "(none)";
  if (target === target.ownerDocument.body) return "body";
  const role = target.getAttribute("role");
  const label = (target.getAttribute("aria-label") ?? target.textContent ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEXT);
  const tag = target.tagName.toLowerCase() + (role ? `[${role}]` : "");
  return label ? `${tag} "${label}"` : tag;
}
