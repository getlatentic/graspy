import type { CatalogueLesson } from "@/lib/voice/voice-types";

const FILES = import.meta.glob<string>("/src/assets/lessons/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

/** The pictures by file name without its extension, as the build serves them. */
export const PICTURE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [
    path.slice(path.lastIndexOf("/") + 1, -".webp".length),
    url,
  ]),
);

// Lessons with a picture that fits them by name: counting and adding are shared by the lessons of one kind.
const PICTURE_BY_LESSON: Record<string, string> = {
  "english.alphabet.letter-sounds": "letter-sounds",
  "mathematics.number.counting-to-ten": "counting",
  "mathematics.number.counting-to-twenty": "counting",
  "mathematics.number.counting-in-twos": "counting",
  "mathematics.number.counting-in-fives": "counting",
  "mathematics.number.counting-in-tens": "counting",
  "mathematics.number.counting-in-sevens": "counting",
  "mathematics.operations.addition-facts-to-twenty": "adding",
  "mathematics.operations.multiplication-as-repeated-addition": "adding",
};

// A theme whose one picture fits every lesson in it.
const PICTURE_BY_THEME: Record<string, string> = {
  alphabet: "alphabet",
  number: "number",
  multiplication: "times-tables",
  time: "telling-the-time",
  money: "naira-and-kobo",
  shapes: "shapes",
  fractions: "fractions",
};

const own = (table: Record<string, string>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** The file name of the lesson's picture, or nothing when no picture fits it. */
export const pictureNameOf = (lesson: CatalogueLesson) =>
  own(PICTURE_BY_LESSON, lesson.plan_id) ?? own(PICTURE_BY_THEME, lesson.topic);

export const pictureNames = () => [
  ...new Set([
    ...Object.values(PICTURE_BY_LESSON),
    ...Object.values(PICTURE_BY_THEME),
  ]),
];

/** Where the lesson's picture is served from, or nothing when no picture fits it. */
export function lessonPicture(lesson: CatalogueLesson): string | undefined {
  const name = pictureNameOf(lesson);
  return name === undefined ? undefined : own(PICTURE_URLS, name);
}
