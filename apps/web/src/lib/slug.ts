// Letters with no Unicode decomposition, such as Hausa's hooked consonants.
// Must match app/utils/slug.py, or one subject lands twice in the curriculum.
const TRANSLITERATIONS: Record<string, string> = {
  ɓ: "b",
  ɗ: "d",
  ƙ: "k",
  ƴ: "y",
  ø: "o",
  æ: "ae",
  œ: "oe",
  å: "a",
  ß: "ss",
  ð: "d",
  þ: "th",
  ł: "l",
  đ: "d",
};

function fold(value: string): string {
  // Letters and digits of every script stay: keeping only a-z would slug
  // every Arabic subject "subject". Decomposed before lowercasing ("𝕬" has
  // no lowercase until it becomes "A") and after ("İ" gains a mark).
  const unmarked = value
    .normalize("NFKD")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");

  return Array.from(unmarked)
    .map((char) => TRANSLITERATIONS[char] ?? char)
    .join("")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSlug(value: string): string {
  return fold(value) || "subject";
}

export function createSlug(source: string, existing: Set<string>): string {
  const base = normalizeSlug(source);
  let slug = base;
  let suffix = 2;

  while (existing.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  existing.add(slug);
  return slug;
}

export function normalizeSubjectList(
  subjects: Array<{ name: string; slug?: string } | string>,
): {
  subjects: { name: string; slug: string }[];
  nameToSlug: Map<string, string>;
} {
  const existing = new Set<string>();
  const normalized: { name: string; slug: string }[] = [];
  const nameToSlug = new Map<string, string>();

  for (const entry of subjects) {
    const name = typeof entry === "string" ? entry : entry.name;
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }

    const providedSlug =
      typeof entry === "string" ? undefined : entry.slug?.trim();
    const slug =
      providedSlug && !existing.has(providedSlug)
        ? (existing.add(providedSlug), providedSlug)
        : createSlug(trimmed, existing);

    normalized.push({ name: trimmed, slug });
    nameToSlug.set(trimmed, slug);
  }

  return { subjects: normalized, nameToSlug };
}
