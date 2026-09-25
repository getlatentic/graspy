import {
  planIdFor,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";
import type {
  LearntTopic,
  LessonContentPayload,
  PracticeRecord,
  StoredLesson,
} from "@/lib/learning-records";
import { normalizeSubjectList } from "@/lib/slug";

// Each step reads its own version's stored shapes, whatever the app writes now.
// A message step returns the same object when it has nothing to rewrite.

const PRACTICE_UI = "ui://graspy/practice";

interface StoredQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  correctFeedback: string;
  incorrectFeedback: string;
  hint: string;
}

interface StoredResult<C> {
  content: { type: "text"; text: string }[];
  structuredContent: C;
  _meta: { viewUUID: string };
}

function hasChoices(question: Partial<StoredQuestion>): boolean {
  const { options, answerIndex } = question;
  return (
    Array.isArray(options) &&
    options.length >= 2 &&
    options.every((option) => typeof option === "string") &&
    Number.isInteger(answerIndex) &&
    answerIndex! >= 0 &&
    answerIndex! < options.length
  );
}

function isStoredQuestion(value: unknown): value is StoredQuestion {
  const question = value as Partial<StoredQuestion> | null;
  if (!question || !hasChoices(question)) return false;
  const { correctFeedback, incorrectFeedback, hint } = question;
  return [question.question, correctFeedback, incorrectFeedback, hint].every(
    (text) => typeof text === "string",
  );
}

function answerOf(question: StoredQuestion, chosenIndex: number) {
  return {
    question: question.question,
    options: question.options,
    answerIndex: question.answerIndex,
    chosenIndex,
  };
}

type LegacyCurriculumSubject = string | CurriculumSubject;

interface LegacyCurriculumData extends Omit<
  CurriculumData,
  "subjects" | "topics" | "assessment" | "planId"
> {
  planId?: string;
  subjects: LegacyCurriculumSubject[];
  topics?: Record<string, string[]>;
  assessment?: {
    nextSubject: string | null;
  };
}

// Earlier versions kept subjects and topics by name, and no plan id.
export function currentPlan(
  input: CurriculumData | LegacyCurriculumData | null,
): CurriculumData | null {
  if (!input) return null;
  const {
    subjects: rawSubjects,
    topics: rawTopics,
    assessment,
    ...rest
  } = input as LegacyCurriculumData;
  const { subjects, nameToSlug } = normalizeSubjectList(rawSubjects ?? []);
  return {
    ...rest,
    planId: rest.planId ?? planIdFor(rest.createdAt),
    subjects,
    topics: topicsBySlug(subjects, rawTopics ?? {}),
    assessment: assessment
      ? {
          ...assessment,
          nextSubject: nextSubjectSlug(
            assessment.nextSubject,
            subjects,
            nameToSlug,
          ),
        }
      : undefined,
  };
}

function topicsBySlug(
  subjects: CurriculumSubject[],
  source: Record<string, unknown>,
): Record<string, string[]> {
  const bySlug: Record<string, string[]> = {};
  for (const { slug, name } of subjects) {
    const kept = [source[slug], source[name]].find(Array.isArray) ?? [];
    bySlug[slug] = [...kept];
  }
  return bySlug;
}

function nextSubjectSlug(
  next: string | null,
  subjects: CurriculumSubject[],
  nameToSlug: Map<string, string>,
): string | null {
  if (!next || subjects.length === 0) return null;
  if (subjects.some((subject) => subject.slug === next)) return next;
  return nameToSlug.get(next) ?? null;
}

// Undoes only the server's old bold repair, which turned
// "code.\n\n**Key Points:**" into "code.**\nKey Points:**".
function restoreBrokenBold(body: string): string {
  return body.replace(
    /([^\s*])\*\*\n(?!\*)([^\n*]+?)\*\*[ \t]*(?=\n|$)/g,
    "$1\n\n**$2**",
  );
}

function withBoldRestored(lesson: LessonContentPayload): LessonContentPayload {
  return {
    ...lesson,
    slides: (lesson.slides ?? []).map((slide) => ({
      ...slide,
      bodyMd: restoreBrokenBold(slide.bodyMd),
    })),
  };
}

const LESSON_PREFIX = "lesson-cache:";
const PROGRESS_PREFIX = "simple-topic-status:";
const UNUSED_PREFIX = "topic-status:";
const THREAD_KEY = "graspy_tutor_thread";
const LESSON_FORMAT = 3;

interface LocalLearning {
  lessons: StoredLesson[];
  learnt: LearntTopic[];
  // Every earlier key, moved or not.
  keys: string[];
}

type Resolve = (subject: string) => { slug: string; topics: string[] } | null;

function resolverFor(plan: CurriculumData): Resolve {
  return (subject) => {
    const found = plan.subjects.find(
      (item) => item.slug === subject || item.name === subject,
    );
    return found
      ? { slug: found.slug, topics: plan.topics?.[found.slug] ?? [] }
      : null;
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function lessonFrom(
  rest: string,
  value: string,
  plan: CurriculumData,
  resolve: Resolve,
): StoredLesson | null {
  const split = rest.lastIndexOf(":");
  const subject = resolve(decodeURIComponent(rest.slice(0, split)));
  const topicIndex = Number(rest.slice(split + 1));
  const record = parseJson(value) as
    | (Partial<StoredLesson> & {
        format?: number;
      })
    | null;
  if (!subject || !record?.lesson || record.format !== LESSON_FORMAT) {
    return null;
  }
  const topic = subject.topics[topicIndex];
  if (!topic || record.topic !== topic) return null;
  return {
    planId: plan.planId,
    subjectSlug: subject.slug,
    topicIndex,
    topic,
    lesson: withBoldRestored(record.lesson),
    session: record.session!,
    savedAt: record.savedAt ?? Date.now(),
  };
}

function learntFrom(
  rest: string,
  value: string,
  plan: CurriculumData,
  resolve: Resolve,
): LearntTopic[] {
  const subject = resolve(decodeURIComponent(rest));
  const statuses = parseJson(value);
  if (!subject || !Array.isArray(statuses)) return [];
  return subject.topics.flatMap((topic, topicIndex) =>
    statuses[topicIndex] === "completed"
      ? [
          {
            planId: plan.planId,
            subjectSlug: subject.slug,
            topicIndex,
            topic,
            learntAt: Date.now(),
          },
        ]
      : [],
  );
}

const isEarlierKey = (key: string) =>
  key.startsWith(LESSON_PREFIX) ||
  key.startsWith(PROGRESS_PREFIX) ||
  key.startsWith(UNUSED_PREFIX) ||
  key === THREAD_KEY;

export function readLocalLearning(
  plan: CurriculumData | null,
  entries: [key: string, value: string][],
): LocalLearning {
  const found: LocalLearning = { lessons: [], learnt: [], keys: [] };
  const resolve = plan && resolverFor(plan);
  for (const [key, value] of entries) {
    if (!isEarlierKey(key)) continue;
    found.keys.push(key);
    if (!plan || !resolve) continue;
    if (key.startsWith(LESSON_PREFIX)) {
      const rest = key.slice(LESSON_PREFIX.length);
      const lesson = lessonFrom(rest, value, plan, resolve);
      if (lesson) found.lessons.push(lesson);
    } else if (key.startsWith(PROGRESS_PREFIX)) {
      const rest = key.slice(PROGRESS_PREFIX.length);
      found.learnt.push(...learntFrom(rest, value, plan, resolve));
    }
  }
  return found;
}

export function localEntries(): [string, string][] {
  try {
    return Object.keys(localStorage).map((key) => [
      key,
      localStorage.getItem(key) ?? "",
    ]);
  } catch {
    return [];
  }
}

export function forgetLocal(keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Unread keys cost space, not correctness.
  }
}

interface StoredScope {
  kind: string;
  planId?: string;
  subjectSlug?: string;
  topic?: string;
}

interface StoredMessage {
  id: string;
  threadId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

function withoutType(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const { type: _type, ...rest } = value as Record<string, unknown>;
  return rest;
}

export function messageInCurrentShape<M extends StoredMessage>(message: M): M {
  const { practice, practiceChosen, practiceAnswer, ...rest } =
    message.metadata ?? {};
  if (
    practice === undefined &&
    practiceChosen === undefined &&
    practiceAnswer === undefined
  ) {
    return message;
  }
  const metadata: Record<string, unknown> = { ...rest };
  const content = withoutType(practice);
  if (isStoredQuestion(content)) {
    metadata.card = {
      resourceUri: PRACTICE_UI,
      toolName: "give_practice",
      structuredContent: content,
    };
  }
  if (typeof practiceChosen === "number") {
    metadata.cardState = { chosen: practiceChosen };
  }
  if (practiceAnswer && typeof practiceAnswer === "object") {
    metadata.appCalls = [
      {
        jsonrpc: "2.0",
        id: 0,
        method: "tools/call",
        params: { name: "answer_practice", arguments: practiceAnswer },
      },
    ];
  }
  return { ...message, metadata };
}

function placeOf(planId: string, { subjectSlug, topic }: StoredScope) {
  return {
    planId,
    ...(subjectSlug ? { subjectSlug } : {}),
    ...(topic ? { topic } : {}),
  };
}

export function practiceRecordOfMessage(
  message: StoredMessage,
  scope: StoredScope | undefined,
): PracticeRecord | null {
  const card = message.metadata?.card as
    { structuredContent?: StoredQuestion } | undefined;
  const chosen = (message.metadata?.cardState as { chosen?: unknown })?.chosen;
  const practice = card?.structuredContent;
  if (!scope?.planId || !isStoredQuestion(practice)) return null;
  if (typeof chosen !== "number") return null;
  return {
    messageId: message.id,
    ...placeOf(scope.planId, scope),
    question: practice.question,
    correct: chosen === practice.answerIndex,
    answeredAt: message.timestamp,
  };
}

// One question, before practice came in sets.
interface CardAtVersion6 {
  resourceUri: typeof PRACTICE_UI;
  toolName: "give_practice";
  toolInput: Record<string, unknown>;
  toolResult: StoredResult<StoredQuestion>;
}

function isCardAtVersion6(value: unknown): value is CardAtVersion6 {
  const card = value as Partial<CardAtVersion6> | null;
  return (
    card?.resourceUri === PRACTICE_UI &&
    typeof card.toolInput === "object" &&
    card.toolInput !== null &&
    isStoredQuestion(card.toolResult?.structuredContent) &&
    typeof card.toolResult?._meta?.viewUUID === "string"
  );
}

// The message's id keys what the view keeps: one card per message.
function viewCardOf(
  messageId: string,
  practice: StoredQuestion,
): CardAtVersion6 {
  return {
    resourceUri: PRACTICE_UI,
    toolName: "give_practice",
    toolInput: {},
    toolResult: {
      content: [{ type: "text", text: practice.question }],
      structuredContent: practice,
      _meta: { viewUUID: messageId },
    },
  };
}

export function messageWithViewCard<M extends StoredMessage>(message: M): M {
  const { card, cardState, ...rest } = message.metadata ?? {};
  if (
    cardState === undefined &&
    (card === undefined || isCardAtVersion6(card))
  ) {
    return message;
  }
  const metadata: Record<string, unknown> = { ...rest };
  const practice = (card as { structuredContent?: unknown } | undefined)
    ?.structuredContent;
  if (isCardAtVersion6(card)) metadata.card = card;
  else if (isStoredQuestion(practice)) {
    metadata.card = viewCardOf(message.id, practice);
    const chosen = (cardState as { chosen?: unknown } | undefined)?.chosen;
    if (typeof chosen === "number") {
      metadata.viewCalls = [
        {
          jsonrpc: "2.0",
          id: 0,
          method: "tools/call",
          params: {
            name: "answer_practice",
            arguments: { ...answerOf(practice, chosen) },
          },
        },
      ];
    }
  }
  return { ...message, metadata };
}

export function messageWithQuestionSet<M extends StoredMessage>(message: M): M {
  const card = message.metadata?.card;
  if (!isCardAtVersion6(card)) return message;
  const set = {
    ...card,
    toolResult: {
      ...card.toolResult,
      structuredContent: {
        instruction: "",
        questions: [card.toolResult.structuredContent],
      },
    },
  };
  return { ...message, metadata: { ...message.metadata, card: set } };
}
