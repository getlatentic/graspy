import { readFileSync } from "node:fs";

/** The words the page shows a child, read from the web app's own locale files so they cannot drift. */
export interface PageStrings {
  ok: string;
  start: string;
  record: string;
  speakNow: string;
  rest: string;
  continue: string;
  loadFailed: string;
  /** What the page says when an answer is kept to be checked later. */
  kept: string[];
  /** Every line the page may show under the lesson when something went wrong. */
  problems: string[];
}

type Locale = { voice: { ok: string; start: string; lesson: Record<string, string>; problem: Record<string, string> } };

export function pageStrings(language: string, locales = new URL("../../web/src/locales/", import.meta.url)): PageStrings {
  const { voice } = JSON.parse(readFileSync(new URL(`${language}.json`, locales), "utf8")) as Locale;
  return {
    ok: voice.ok,
    start: voice.start,
    record: voice.lesson.record,
    speakNow: voice.lesson.speakNow,
    rest: voice.lesson.rest,
    continue: voice.lesson.continue,
    loadFailed: voice.lesson.loadFailed,
    kept: [voice.lesson.kept, voice.lesson.keptOnline],
    problems: Object.values(voice.problem),
  };
}

export interface OnboardingStrings {
  next: string;
  start: string;
  finding: string;
  readyTitle: string;
  readyContinue: string;
}

type Onboarding = {
  onboarding?: {
    next?: string;
    start?: string;
    subjects?: { finding?: string };
    ready?: { title?: string; continue?: string };
  };
};

function localeFile(language: string, locales: URL): Onboarding {
  return JSON.parse(readFileSync(new URL(`${language}.json`, locales), "utf8")) as Onboarding;
}

/** The onboarding screens' words in the language chosen, falling back to English as the app does. */
export function onboardingStrings(language: string, locales = new URL("../../web/src/locales/", import.meta.url)): OnboardingStrings {
  const own = localeFile(language, locales).onboarding;
  const english = localeFile("en", locales).onboarding;
  return {
    next: own?.next ?? english?.next ?? "Next",
    start: own?.start ?? english?.start ?? "Start learning",
    finding: own?.subjects?.finding ?? english?.subjects?.finding ?? "Finding subjects",
    readyTitle: own?.ready?.title ?? english?.ready?.title ?? "Your plan is ready",
    readyContinue: own?.ready?.continue ?? english?.ready?.continue ?? "Start",
  };
}
