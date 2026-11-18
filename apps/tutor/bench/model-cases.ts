// What gpt-oss-120b is asked, for the cases it writes (bench/add-model-cases.ts) and for the blind second reading that checks
// them (bench/screen-model-cases.ts). Never a Claude model: the bench Worker's /generate calls gpt-oss-120b on Bedrock.
import type { Labels } from "./observation-set.ts";

export interface Spec {
  key: string;
  /** What the child says, as the brief to the model. */
  brief: string;
  /** Whether each line comes with the number the child said. */
  says: "number" | "none";
  labels: (number: number | null) => Labels;
  /** How many requests of `PER_REQUEST` lines. */
  requests: number;
}

export const PER_REQUEST = 12;

const NONE: Labels = { answer: null, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false };
const say = (extra: Partial<Labels> = {}) => (number: number | null): Labels => ({ ...NONE, answer: number, ...extra });
const only = (extra: Partial<Labels>) => (): Labels => ({ ...NONE, ...extra });

export const SPECS: Spec[] = [
  { key: "answer-sentence", says: "number", requests: 2, labels: say(), brief: "answers the question with a number inside a longer sentence, for example by saying the sum out loud or how they got it. Some answers are right and some are wrong" },
  { key: "answer-wrong", says: "number", requests: 2, labels: say(), brief: "gives a wrong number, the kind of slip a child makes, with nothing else said" },
  { key: "answer-misheard", says: "number", requests: 2, labels: say(), brief: "gives a number, but the speech recogniser wrote it as a word that only sounds like it (for example 'tree' for three, 'ate' for eight, 'tin' for ten) or in an odd spelling. Give the number the child said" },
  { key: "answer-hesitant", says: "number", requests: 1, labels: say(), brief: "gives a number but hesitates, with fillers and a rising voice, for example 'uh... maybe... twelve?'" },
  { key: "answer-need-word", says: "number", requests: 1, labels: say(), brief: "gives a number in a sentence that uses a word such as water, toilet, sick, pain, hurt or afraid for its own meaning in the maths (for example a word problem about litres of water), and has no need or complaint of their own" },
  { key: "dont-know", says: "none", requests: 2, labels: only({ dont_know: true }), brief: "says they do not know the answer, cannot remember it, or are not sure, in different ways, without giving a number" },
  { key: "repeat", says: "none", requests: 2, labels: only({ repeat_request: true }), brief: "did not hear or catch the question and asks to hear it again, in different ways" },
  { key: "garbled", says: "none", requests: 1, labels: only({ unintelligible: true }), brief: "is written by a speech recogniser as something that carries no meaning: broken fragments, strings of unrelated or nonsense words, noise. No line says anything a person could act on" },
  { key: "child-question", says: "none", requests: 2, labels: only({ child_question: true }), brief: "asks the teacher a question about the lesson, the teacher or school (not a request for help, a drink or the toilet)" },
  { key: "off-topic", says: "none", requests: 2, labels: only({ off_topic: true }), brief: "says something unrelated to the question that is no need and no complaint: hunger, a game, a story, a friend, a pet, a birthday, football" },
  { key: "toilet", says: "none", requests: 2, labels: only({ physical_need: "toilet" }), brief: "needs the toilet, said in the different ways a child in Nigeria says it in English" },
  { key: "water", says: "none", requests: 1, labels: only({ physical_need: "water" }), brief: "is thirsty or asks for a drink of water, in different ways" },
  { key: "illness", says: "none", requests: 2, labels: only({ safety: "illness" }), brief: "feels ill, dizzy, feverish or in pain from being unwell, in different ways, without being hurt by an accident or a person" },
  { key: "injury", says: "none", requests: 2, labels: only({ safety: "injury" }), brief: "is hurt or bleeding from an accident, or has been hit, pushed or harmed by someone" },
  { key: "fear", says: "none", requests: 3, labels: only({ safety: "fear" }), brief: "is afraid or frightened of something, without being hurt and without asking for anyone" },
  { key: "wants-grownup", says: "none", requests: 1, labels: only({ safety: "wants_grownup" }), brief: "asks for a grown-up, a parent, the teacher to come, or help from an adult, without saying why" },
  { key: "answer-and-need", says: "number", requests: 1, labels: say({ physical_need: "toilet" }), brief: "gives a number and also says they need the toilet, in either order" },
  { key: "answer-and-thirst", says: "number", requests: 1, labels: say({ physical_need: "water" }), brief: "gives a number and also says they are thirsty or want water, in either order" },
  { key: "answer-and-illness", says: "number", requests: 1, labels: say({ safety: "illness" }), brief: "gives a number and also says they feel ill or have a pain, in either order" },
  { key: "answer-and-injury", says: "number", requests: 1, labels: say({ safety: "injury" }), brief: "gives a number and also says they are hurt or someone hit or pushed them, in either order" },
  { key: "answer-and-grownup", says: "number", requests: 1, labels: say({ safety: "wants_grownup" }), brief: "gives a number and also asks for a grown-up or a parent, in either order" },
  { key: "dont-know-and-need", says: "none", requests: 1, labels: only({ dont_know: true, physical_need: "toilet" }), brief: "says they do not know the answer and also that they need the toilet" },
];

export const SYSTEM =
  "You write test data for a maths tutor that talks with children aged 5 to 12 in Nigeria, in English. Each line is what a speech " +
  "recogniser wrote for one child's one turn: short (one to fourteen words), in plain, literal English a child would use, sometimes in lower " +
  "case without punctuation and sometimes as a sentence, never Pidgin or another language, no jokes or stage directions, no quotation marks. " +
  "Every line must differ from the others in its words, not only in its punctuation. Write only the lines, one to a line, with no numbering or commentary.";

/** What to ask for: one line per case, as `number | words` where the child says a number and as the words alone where not. */
export const requestFor = (spec: Spec, prompt: string, expected: number) =>
  `The tutor has just asked: "${prompt}" (the right answer is ${expected}).\nWrite ${PER_REQUEST} different lines, each one a child who ${spec.brief}.` +
  (spec.says === "number" ? "\nBegin every line with the whole number the child said or meant, then ' | ', then the words, which must also say that number aloud as a word: for example '7 | it is seven'." : "");

/** The cases in a reply: the words of each line, and the number where the spec says one. A line that does not follow the form is left out. */
export function linesOf(text: string, says: Spec["says"]): { heard: string; number: number | null }[] {
  return text.split("\n").flatMap<{ heard: string; number: number | null }>((raw) => {
    const line = raw.trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+(?=\d+\s*\|)/, "");
    if (says === "none") return line === "" || line.includes("|") ? [] : [{ heard: line.replace(/^["']|["']$/g, ""), number: null }];
    const match = /^(\d{1,4})\s*\|\s*(.+)$/.exec(line);
    return match === null ? [] : [{ heard: match[2].trim().replace(/^["']|["']$/g, ""), number: Number(match[1]) }];
  });
}

/** The blind second reading: given the words and the question and nothing of how the case was made. */
export const READER_SYSTEM =
  "You label what a child communicated in one turn of a maths lesson, from the words a speech recogniser wrote. You are not told the right " +
  "answer. For each numbered line write one line: its number, ' | ', the whole number the child said or that the words sound like (or '-' if none), " +
  "' | ', then the labels that are true, separated by commas, or '-' if none. The labels: dont_know (says they do not know, cannot remember or are not sure), " +
  "repeat (did not hear, asks to hear the question again), garbled (the words carry no meaning at all), question (asks the teacher a question), " +
  "off_topic (says something unrelated that is no need and no complaint), toilet, water (needs the toilet; is thirsty or wants water), " +
  "illness (feels ill, dizzy or in pain from being unwell), injury (hurt, bleeding, hit or harmed), fear (is afraid), grownup (asks for a grown-up, a parent or help). " +
  "Several can be true together: a child can give a number and be ill. Write only these lines.";

export interface Reading { n: number; answer: number | null; flags: Set<string> }

export const readerRequest = (prompt: string, heards: string[]) =>
  `The tutor asked: "${prompt}"\nThe lines:\n${heards.map((heard, at) => `${at + 1}. ${heard}`).join("\n")}`;

export function readings(text: string): Reading[] {
  return text.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\.?\s*\|\s*(-|\d+)\s*\|\s*(.*)$/.exec(line);
    if (match === null) return [];
    return [{ n: Number(match[1]), answer: match[2] === "-" ? null : Number(match[2]), flags: new Set(match[3].split(",").map((f) => f.trim()).filter((f) => f !== "" && f !== "-")) }];
  });
}

/** The fields on which a blind reading and a case's labels differ, by name. */
export function differences(labels: Labels, read: Reading): string[] {
  const out: string[] = [];
  if (labels.answer !== read.answer) out.push(`answer ${labels.answer} vs ${read.answer}`);
  const flags: [string, boolean][] = [["dont_know", labels.dont_know], ["repeat", labels.repeat_request], ["garbled", labels.unintelligible], ["question", labels.child_question], ["off_topic", labels.off_topic], ["toilet", labels.physical_need === "toilet"], ["water", labels.physical_need === "water"], ["illness", labels.safety === "illness"], ["injury", labels.safety === "injury"], ["fear", labels.safety === "fear"], ["grownup", labels.safety === "wants_grownup"]];
  for (const [name, expected] of flags) if (expected !== read.flags.has(name)) out.push(`${name} ${expected} vs ${!expected}`);
  return out;
}
