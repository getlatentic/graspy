import { FIELDS, type Observation } from "../src/observation";
import { SETTING } from "../src/router";

type Probabilities = Record<string, number>;
type Answers = Record<string, { probabilities?: Probabilities } | undefined>;

const NUMBERS: Record<string, string> = { none: "no number", ...Object.fromEntries(Array.from({ length: 101 }, (_, n) => [String(n), String(n)])) };

const yesNo = (what: string) => ({
  type: "choice",
  instructions: `${SETTING}Does the child ${what}? Judge this alone, whatever else they said.`,
  criteria: { yes: `the child ${what}`, no: `the child does not ${what}` },
});

const chance = (answers: Answers, name: string) => answers[name]?.probabilities?.yes ?? 0;

/** The same observation as the model's, from Cloudflare's Clef: one typed yes-or-no question per field and one for the number, in one call. */
export async function observeWithClef(env: Env, model: "clef" | "clef-flash", prompt: string, heard: string): Promise<Observation | null> {
  const fields = Object.values(FIELDS).flatMap((group) => Object.entries(group));
  const reply = (await env.AI.run(`@cf/cloudflare/${model}`, {
    model,
    state: `The question just asked: ${prompt}\nThe recogniser wrote what the child said: ${JSON.stringify(heard)}`,
    questions: {
      ...Object.fromEntries(fields.map(([name, what]) => [name, yesNo(what)])),
      gave_number: yesNo("say a number, or a word that sounds like one"),
      value: { type: "choice", instructions: `${SETTING}Which number did the child say, or mean?`, criteria: NUMBERS },
    },
  }).catch(() => null)) as { answers?: Answers } | null;
  const answers = reply?.answers;
  if (!answers) return null;
  const value = Object.entries(answers.value?.probabilities ?? {}).reduce<[string, number]>((best, entry) => (entry[1] > best[1] ? entry : best), ["none", 0]);
  const scores = <G extends keyof typeof FIELDS>(group: G) => Object.fromEntries(Object.keys(FIELDS[group]).map((name) => [name, chance(answers, name)]));
  return {
    answer: /^\d+$/.test(value[0]) ? { value: Number(value[0]), confidence: chance(answers, "gave_number") * value[1] } : null,
    communication: scores("communication"),
    physicalNeed: scores("physicalNeed"),
    safety: scores("safety"),
  } as Observation;
}
