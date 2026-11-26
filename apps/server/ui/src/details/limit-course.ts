const DROPPED = /[^\p{L}\p{N}\p{M} .,&/+-]/gu;
const MAX_WORDS = 12;
const MAX_CHARS = 80;

/** What the form lets a course be, as the server cleans it (agent/course.py): normalised, with only
 * letters, digits, spaces and . , & / + - kept, at most twelve words and eighty characters.
 * `changed` says something the learner typed was taken out. */
export function limitCourse(typed: string): { text: string; changed: boolean } {
  const normal = typed.normalize("NFKC");
  const kept = normal.replace(DROPPED, "");
  // Words as the server counts them: runs of text, not the spaces between.
  let counted = 0;
  const allowed: string[] = [];
  for (const word of kept.split(" ")) {
    if (word !== "") counted += 1;
    if (counted > MAX_WORDS) break;
    allowed.push(word);
  }
  const text = allowed.join(" ").slice(0, MAX_CHARS);
  return { text, changed: text !== normal };
}

/** The course as it is sent. */
export const finalCourse = (typed: string): string =>
  limitCourse(typed)
    .text.split(" ")
    .filter(Boolean)
    .join(" ")
    .replace(/^[ .,&/+-]+|[ .,&/+-]+$/g, "");
