import type { LearningPath } from "@/lib/curriculum-api";
import {
  topicsOf,
  type CurriculumData,
  type CurriculumSource,
  type CurriculumSubject,
} from "@/lib/curriculum-record";
import { normalizeSubjectList } from "@/lib/slug";

/** A path topic's own level, otherwise the plan's. */
export function topicLevel(
  curriculum: CurriculumData | null,
  subject: CurriculumSubject,
  topic: string,
): string {
  return (
    curriculum?.levels?.[subject.slug]?.[topic] ?? curriculum?.gradeLevel ?? ""
  );
}

function ofSubjects<T>(
  bySubject: Record<string, T> | undefined,
  subjects: CurriculumSubject[],
): Record<string, T> {
  const slugs = new Set(subjects.map((subject) => subject.slug));
  return Object.fromEntries(
    Object.entries(bySubject ?? {}).filter(([slug]) => slugs.has(slug)),
  );
}

export function goalIndex(
  curriculum: CurriculumData | null,
  subjectSlug: string,
): number {
  const goal = curriculum?.goals?.[subjectSlug];
  return goal ? topicsOf(curriculum, subjectSlug).indexOf(goal) : -1;
}

export function pathsOf(curriculum: CurriculumData): CurriculumSubject[] {
  return curriculum.subjects.filter(
    (subject) => curriculum.levels?.[subject.slug],
  );
}

export function withPath(
  curriculum: CurriculumData,
  path: LearningPath,
): { curriculum: CurriculumData; subject: CurriculumSubject } {
  const name = path.subject.trim() || path.goal.trim();
  const existing = curriculum.subjects.find((subject) => subject.name === name);
  if (existing) return { curriculum, subject: existing };

  const { subjects } = normalizeSubjectList([...curriculum.subjects, name]);
  const subject = subjects[subjects.length - 1];
  const steps = path.steps.filter(
    (step, index, all) =>
      step.title.trim() &&
      all.findIndex((other) => other.title === step.title) === index,
  );
  // The path is planned to end with the goal itself.
  const goal = steps[steps.length - 1]?.title;
  return {
    curriculum: {
      ...curriculum,
      subjects: [...curriculum.subjects, subject],
      topics: {
        ...topicsBySlug(curriculum, curriculum.subjects),
        [subject.slug]: steps.map((step) => step.title),
      },
      levels: {
        ...curriculum.levels,
        [subject.slug]: Object.fromEntries(
          steps.map((step) => [step.title, step.level]),
        ),
      },
      goals: {
        ...curriculum.goals,
        ...(goal ? { [subject.slug]: goal } : {}),
      },
      updatedAt: Date.now(),
    },
    subject,
  };
}

export function withPathsFrom(
  target: CurriculumData,
  source: CurriculumData,
): CurriculumData {
  const paths = pathsOf(source).filter(
    (subject) => !target.subjects.some((other) => other.name === subject.name),
  );
  if (paths.length === 0) return target;
  return {
    ...target,
    subjects: [...target.subjects, ...paths],
    topics: {
      ...topicsBySlug(target, target.subjects),
      ...topicsBySlug(source, paths),
    },
    levels: { ...target.levels, ...ofSubjects(source.levels, paths) },
    goals: { ...target.goals, ...ofSubjects(source.goals, paths) },
    updatedAt: Date.now(),
  };
}

/** Topics keyed by slug only, so an edit never leaves two lists for one subject. */
function topicsBySlug(
  curriculum: CurriculumData,
  subjects: CurriculumSubject[],
): Record<string, string[]> {
  return Object.fromEntries(
    subjects.map((subject) => [
      subject.slug,
      [...topicsOf(curriculum, subject.slug)],
    ]),
  );
}

const SKIPPED_WORDS = new Set(["the", "a", "an", "of", "and"]);

/**
 * A topic as it is compared with the ones already in the plan: a tutor's "Decimal Numbers", "decimal number" and
 * "Decimal numbers!" are one topic. Case, accents, punctuation, "&", small words and a plural "s" do not make
 * another.
 */
export function topicKey(title: string): string {
  return topicWords(title).join(" ");
}

function topicWords(title: string): string[] {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word && !SKIPPED_WORDS.has(word))
    .map((word) =>
      word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
    );
}

/** Edits between two words, a swap of neighbours counting as one. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/** The slips of spelling a word of this length can carry and still be the same word: none in a short one. */
const SLIPS = (length: number): number =>
  length <= 4 ? 0 : length <= 7 ? 1 : length <= 10 ? 2 : 4;

const isWordOf = (word: string): boolean => !/\d/.test(word);

/**
 * Whether two topic titles are the same topic, allowing for how a learner types: the same words in the same
 * order, each spelled as it is or with a few slips, the first letter kept ("sttaical testing" is "statistical testing"), and a number
 * is never a slip ("Algebra 1" is not "Algebra 2").
 */
export function sameTopic(a: string, b: string): boolean {
  const left = topicWords(a);
  const right = topicWords(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return left.every((word, at) => {
    const other = right[at];
    if (word === other) return true;
    if (!isWordOf(word) || !isWordOf(other)) return false;
    // A slip of the fingers seldom changes the first letter; "reproduction" and "production" are two topics.
    if (word[0] !== other[0]) return false;
    return (
      editDistance(word, other) <= SLIPS(Math.max(word.length, other.length))
    );
  });
}

export function withTopic(
  curriculum: CurriculumData,
  subjectSlug: string,
  title: string,
): { curriculum: CurriculumData; index: number } | null {
  const subject = curriculum.subjects.find((s) => s.slug === subjectSlug);
  const trimmed = title.trim();
  if (!subject || !trimmed) return null;

  const topics = topicsOf(curriculum, subject.slug);
  const existing = topics.findIndex((topic) => sameTopic(topic, trimmed));
  if (existing >= 0) return { curriculum, index: existing };

  return {
    curriculum: {
      ...curriculum,
      topics: {
        ...topicsBySlug(curriculum, curriculum.subjects),
        [subject.slug]: [...topics, trimmed],
      },
      updatedAt: Date.now(),
    },
    index: topics.length,
  };
}

export function namesAfter(
  subjects: CurriculumSubject[],
  add: string[],
  remove: string[],
): string[] {
  const kept = subjects
    .map((subject) => subject.name)
    .filter((name) => !remove.includes(name));
  return [...new Set([...kept, ...add.map((name) => name.trim())])].filter(
    Boolean,
  );
}

export function subjectChange(current: CurriculumSubject[], names: string[]) {
  const chosen = new Set(names.map((name) => name.trim()).filter(Boolean));
  const currentNames = new Set(current.map((subject) => subject.name));
  return {
    kept: current.filter((subject) => chosen.has(subject.name)),
    removed: current.filter((subject) => !chosen.has(subject.name)),
    added: [...chosen].filter((name) => !currentNames.has(name)),
  };
}

export function withSubjects(
  curriculum: CurriculumData,
  kept: CurriculumSubject[],
  added: {
    subjects: CurriculumSubject[];
    topics: Record<string, string[]>;
    sources?: Record<string, CurriculumSource>;
  },
): CurriculumData {
  const subjects = [...kept, ...added.subjects];
  const topics = {
    ...topicsBySlug(curriculum, kept),
    ...Object.fromEntries(
      added.subjects.map((subject) => [
        subject.slug,
        [...(added.topics[subject.slug] ?? [])],
      ]),
    ),
  };
  const session = curriculum.activeSession;
  return {
    ...curriculum,
    subjects,
    topics,
    sources: { ...ofSubjects(curriculum.sources, kept), ...added.sources },
    levels: ofSubjects(curriculum.levels, kept),
    goals: ofSubjects(curriculum.goals, kept),
    activeSession: kept.some(({ name }) => name === session?.subject)
      ? session
      : undefined,
    assessment: {
      ...curriculum.assessment,
      nextSubject: nextSubjectAmong(
        subjects,
        curriculum.assessment?.nextSubject,
      ),
    },
    updatedAt: Date.now(),
  };
}

function nextSubjectAmong(
  subjects: CurriculumSubject[],
  next: string | null | undefined,
): string | null {
  if (subjects.some((subject) => subject.slug === next)) return next ?? null;
  return subjects[0]?.slug ?? null;
}
