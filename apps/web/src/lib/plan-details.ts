import { COUNTRY_LANGUAGES } from "./country-languages";
import type { CurriculumData } from "./curriculum-record";
import { getCountryName, getLanguageName } from "./locale";
import type { LearnerDetails, UserProfile } from "./user-storage";

/** What a plan keeps of the learner it was written for. */
export type PlanDetails = Pick<
  CurriculumData,
  | "country"
  | "countryName"
  | "countryCode"
  | "language"
  | "languageName"
  | "languageCode"
  | "gradeLevel"
  | "system"
  | "level"
  | "levelNames"
  | "course"
>;

/** The server and the model read English names; the codes bring the profile back. */
export function planDetails(learner: LearnerDetails): PlanDetails {
  const country = getCountryName(learner.country);
  const language = getLanguageName(learner.language);
  return {
    country,
    countryName: country,
    countryCode: learner.country,
    language,
    languageName: language,
    languageCode: learner.language,
    gradeLevel: learner.gradeLevel,
    system: learner.system,
    level: learner.level,
    levelNames: learner.levelNames,
    course: learner.course,
  };
}

const COUNTRIES = Object.keys(COUNTRY_LANGUAGES);
const LANGUAGES = [...new Set(Object.values(COUNTRY_LANGUAGES).flat())];

// A plan without codes names its country and language in English, or by code.
function codeOf(
  value: string,
  codes: string[],
  nameOf: (code: string) => string,
): string | undefined {
  if (codes.includes(value)) return value;
  return codes.find((code) => nameOf(code) === value);
}

export const countryCodeOf = (plan: CurriculumData): string | undefined =>
  plan.countryCode ?? codeOf(plan.country, COUNTRIES, getCountryName);

function placeOf(plan: CurriculumData): Partial<LearnerDetails> {
  const country = countryCodeOf(plan);
  const language =
    plan.languageCode ?? codeOf(plan.language, LANGUAGES, getLanguageName);
  return {
    ...(country ? { country } : {}),
    ...(language ? { language } : {}),
  };
}

/** Whether the learner's details are those the plan was written for. */
export function writtenFor(
  plan: CurriculumData,
  learner: LearnerDetails,
): boolean {
  const { country = learner.country, language = learner.language } =
    placeOf(plan);
  return (
    country === learner.country &&
    language === learner.language &&
    plan.gradeLevel === learner.gradeLevel
  );
}

/** What the device takes from a plan: its level fields replace any earlier school year. */
type AdoptedDetails = Partial<
  LearnerDetails & Pick<UserProfile, "earlierYear">
>;

const NO_LEVEL: AdoptedDetails = {
  system: "",
  level: "",
  levelNames: null,
  course: "",
  earlierYear: undefined,
};

// A plan without level fields names its class only by gradeLevel: the device's level
// fields still fit a plan for its own class, and name the wrong one for any other.
function levelOf(plan: CurriculumData, deviceGrade?: string): AdoptedDetails {
  if (plan.level === undefined) {
    return plan.gradeLevel === deviceGrade ? {} : NO_LEVEL;
  }
  return {
    system: plan.system ?? "",
    level: plan.level,
    levelNames: plan.levelNames ?? null,
    course: plan.course ?? "",
    earlierYear: undefined,
  };
}

export function learnerDetailsOf(
  plan: CurriculumData,
  deviceGrade?: string,
): AdoptedDetails {
  return {
    ...placeOf(plan),
    gradeLevel: plan.gradeLevel,
    ...levelOf(plan, deviceGrade),
  };
}

function namedPlace(plan: CurriculumData): Partial<CurriculumData> {
  const { country, language } = placeOf(plan);
  const countryName = country && getCountryName(country);
  const languageName = language && getLanguageName(language);
  return {
    ...(countryName
      ? { country: countryName, countryName, countryCode: country }
      : {}),
    ...(languageName
      ? { language: languageName, languageName, languageCode: language }
      : {}),
  };
}

function learnersLevel(
  plan: CurriculumData,
  learner: LearnerDetails | null,
): Partial<CurriculumData> {
  if (
    plan.level !== undefined ||
    !learner?.level ||
    !writtenFor(plan, learner)
  ) {
    return {};
  }
  const { system, level, levelNames, course } = learner;
  return { system, level, levelNames, course };
}

/** A plan from an earlier version, completed from what the device knows: its place named
 * in English with codes, and the level of the learner it was written for. */
export function completedPlan(
  plan: CurriculumData,
  learner: LearnerDetails | null,
): CurriculumData {
  return { ...plan, ...namedPlace(plan), ...learnersLevel(plan, learner) };
}
