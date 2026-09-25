/** What a lesson says about where its content came from. */

export interface LessonSourceReference {
  readonly title: string;
  readonly attribution: string;
}

/// Attribution names the work, not each excerpt, and a lesson draws many
/// excerpts from one book. Repeating the licence under every title pushed the
/// titles themselves off the screen.
export function groupByAttribution(
  references: readonly { readonly recordId: string; readonly title: string; readonly attribution: string }[],
) {
  const grouped = new Map<string, string[]>();
  for (const reference of references) {
    const titles = grouped.get(reference.attribution) ?? [];
    if (!titles.includes(reference.title)) titles.push(reference.title);
    grouped.set(reference.attribution, titles);
  }
  return [...grouped].map(([attribution, titles]) => ({ attribution, titles }));
}

/// What the panel says when closed. A teacher checking a lesson wants to know
/// it is grounded and in what, not to read six excerpt titles; the titles and
/// the licence are a click away for anyone who does.
export function sourceSummary(
  references: readonly { readonly title: string; readonly attribution: string }[],
) {
  const works = new Set(references.map((reference) => reference.attribution.split(",")[0].trim()));
  const passages = references.length === 1 ? "1 passage" : `${references.length} passages`;
  return works.size === 1 ? `${passages} from ${[...works][0]}` : `${passages} from ${works.size} sources`;
}

