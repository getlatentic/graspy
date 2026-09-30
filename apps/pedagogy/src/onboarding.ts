import type { Page } from "playwright-core";
import { onboardingStrings } from "./strings.ts";

export interface Learner {
  /** For example primary_4 or nursery_1, as the server names classes. */
  learnerClass: string;
  language: "en" | "yo" | "pcm";
}

const LANGUAGE_OPTION: Record<Learner["language"], RegExp> = {
  en: /^English/,
  yo: /Yor[uù]b[aá]/i,
  pcm: /Pidgin/i,
};

/** "primary_4" as the class list names it: "Primary 4". */
export function classLabel(learnerClass: string): RegExp {
  const [level, year] = learnerClass.split("_");
  return new RegExp(`${level}\\s*${year}\\b`, "i");
}

async function choose(page: Page, field: string, option: RegExp, typed?: string): Promise<void> {
  const box = page.getByPlaceholder(field);
  await box.click();
  if (typed) await box.fill(typed);
  await page.getByRole("option", { name: option }).first().click();
}

/** The plan only has to exist: one subject keeps the model call short. */
async function keepOnlyMathematics(page: Page): Promise<void> {
  const subjects = page.locator("button[aria-pressed]");
  for (let i = 0; i < (await subjects.count()); i++) {
    const subject = subjects.nth(i);
    const wanted = /^\s*(Recommended\s*)?Mathematics/i.test(await subject.innerText());
    const chosen = (await subject.getAttribute("aria-pressed")) === "true";
    if (chosen !== wanted) await subject.click();
  }
}

/** Onboarding as a new signed-out child on this device does it: Nigeria, a class, a language. */
export async function onboard(page: Page, webUrl: string, learner: Learner): Promise<void> {
  await page.goto(`${webUrl}/app`);
  await page.waitForURL(/onboarding/);
  await choose(page, "Search countries", /Nigeria/, "Nigeria");
  await choose(page, "Choose your class", classLabel(learner.learnerClass));
  // Choosing the language switches the screens into it, so it comes last and the rest is read in it.
  await choose(page, "Choose a language", LANGUAGE_OPTION[learner.language]);
  const words = onboardingStrings(learner.language);
  await page.getByRole("button", { name: words.next }).click();
  const start = page.getByRole("button", { name: words.start });
  await start.waitFor();
  await page.waitForFunction(
    (finding) => !document.body.innerText.includes(finding),
    words.finding.replace(/…$/, ""),
    { timeout: 90_000 },
  );
  await keepOnlyMathematics(page);
  await start.click();
  // Building the plan asks a model and can take a minute or more.
  await page.getByText(words.readyTitle).waitFor({ timeout: 180_000 });
  await page.getByRole("button", { name: words.readyContinue, exact: true }).click();
  await page.waitForFunction(() => !location.pathname.includes("onboarding"));
}
