// Plans as the current version makes them, for a class in Nigeria's junior secondary
// school, and the profile of a learner in that class.

type Language = "en" | "yo";
type Year = 1 | 2 | 3;

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  yo: "Yoruba",
};

export const inJss = (year: Year) =>
  `JSS ${year} (Junior Secondary School), Nigeria, age ${11 + year}`;

export function classDetails(year: Year, language: Language = "en") {
  return {
    country: "Nigeria",
    countryName: "Nigeria",
    countryCode: "NG",
    language: LANGUAGE_NAMES[language],
    languageName: LANGUAGE_NAMES[language],
    languageCode: language,
    gradeLevel: inJss(year),
    system: "NG",
    level: `jss-${year}`,
    levelNames: { en: `JSS ${year}`, local: {} },
    course: "",
  };
}

export const slugOf = (name: string) => name.toLowerCase().replaceAll(" ", "-");

export interface PlanOf {
  planId: string;
  subjects: Record<string, string[]>;
  updatedAt: number;
  details?: object;
}

export function plan({
  planId,
  subjects,
  updatedAt,
  details = classDetails(1),
}: PlanOf) {
  const names = Object.keys(subjects);
  return {
    id: "current",
    planId,
    ...details,
    subjects: names.map((name) => ({ name, slug: slugOf(name) })),
    topics: Object.fromEntries(
      names.map((name) => [slugOf(name), subjects[name]]),
    ),
    createdAt: updatedAt - 60_000,
    updatedAt,
  };
}

export function learnerIn(year: Year, language: Language = "en"): string {
  const { countryCode, languageCode, gradeLevel, system, level, levelNames } =
    classDetails(year, language);
  return JSON.stringify({
    id: "e2e",
    country: countryCode,
    language: languageCode,
    gradeLevel,
    system,
    level,
    levelNames,
    course: "",
    preferredSubjects: [],
    onboardingCompleted: true,
  });
}

/** How an earlier version kept a finished topic: the first of the subject's. */
export const firstTopicLearnt = (subject: string) => ({
  [`simple-topic-status:${subject}`]: JSON.stringify(["completed"]),
});

export const HOUR = 3_600_000;

export const PHONE_SUBJECTS = {
  Mathematics: ["Whole Numbers", "Fractions", "Decimals"],
  "Basic Science": ["Living Things", "Energy"],
};

export const LAPTOP_SUBJECTS = {
  "English Studies": ["Reading Comprehension", "Grammar"],
  Mathematics: ["Number and Place Value", "Fractions", "Linear Equations"],
};

export const phonePlan = (updatedAt: number, year: Year = 1) =>
  plan({
    planId: "plan-phone",
    subjects: PHONE_SUBJECTS,
    updatedAt,
    details: classDetails(year),
  });

export const laptopPlan = (updatedAt: number, year: Year = 1) =>
  plan({
    planId: "plan-laptop",
    subjects: LAPTOP_SUBJECTS,
    updatedAt,
    details: classDetails(year),
  });
