// Cases expanded from hand-written templates: a phrase of what a child says, the question it is said to, and a number or
// word where the phrase has one. Each template has one reading, so the label is true by construction. Which expansions are
// kept is decided by the hash of the case id, so the choice is the same on every run and spreads over the prompts and phrases.
// bench/add-template-cases.ts appends the ones whose ids are not in observation.jsonl yet.
import { createHash } from "node:crypto";
import type { Labels, Row } from "./observation-set.ts";

export const PROMPTS: { prompt: string; expected: number }[] = [
  { prompt: "One heap has five oranges. How many oranges are in two heaps?", expected: 10 },
  { prompt: "What is one plus one?", expected: 2 },
  { prompt: "A jug holds five litres of water. How many litres of water in two jugs?", expected: 10 },
  { prompt: "What is three times ten?", expected: 30 },
  { prompt: "What is five plus one?", expected: 6 },
  { prompt: "What is two plus one?", expected: 3 },
  { prompt: "What is eight plus four?", expected: 12 },
  { prompt: "What is nine minus four?", expected: 5 },
  { prompt: "Count in twos: two, four, six. What comes next?", expected: 8 },
  { prompt: "Tola has seven mangoes and gets six more. How many mangoes now?", expected: 13 },
  { prompt: "What is twenty plus twenty?", expected: 40 },
  { prompt: "What is forty plus two?", expected: 42 },
  { prompt: "How many days are in one week?", expected: 7 },
  { prompt: "What is six times four?", expected: 24 },
];

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "- - twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  const [tens, ones] = [Math.floor(n / 10), n % 10];
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

const NONE: Labels = { answer: null, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false };

/** A template: its phrases, what they communicate, and how many of its expansions to keep. `{n}` is the number the child says. */
interface Template {
  name: string;
  phrases: string[];
  /** The labels for a phrase, given the number said where the template has `{n}`. */
  labels: (said: number | null) => Labels;
  keep: number;
  /** Numbers said: the right answer, one off it, or a sound-alike word's number. Omit where the phrases have no `{n}`. */
  says?: "right" | "near" | "word";
}

const answer = (extra: Partial<Labels> = {}) => (said: number | null): Labels => ({ ...NONE, answer: said, ...extra });
const only = (extra: Partial<Labels>) => (): Labels => ({ ...NONE, ...extra });

export const TEMPLATES: Template[] = [
  { name: "answer", says: "near", keep: 34, labels: answer(), phrases: ["{n}", "It is {n}.", "I think it is {n}", "{n} I think", "The answer is {n}", "um, {n}", "{n}?", "it's {n}", "maybe {n}", "{n}, sir", "{n}, teacher", "I got {n}", "that is {n}"] },
  { name: "answer-and-toilet", says: "right", keep: 12, labels: answer({ physical_need: "toilet" }), phrases: ["{n}, I need the toilet", "I need to go to the toilet, I think it is {n}", "please can I use the toilet, it is {n}", "it is {n} and I want to pee", "{n}. I need to go to the toilet"] },
  { name: "answer-and-water", says: "right", keep: 8, labels: answer({ physical_need: "water" }), phrases: ["I am thirsty, the answer is {n}", "can I drink some water? I think {n}", "{n}, and I want some water", "{n}, I need a drink"] },
  { name: "answer-and-illness", says: "right", keep: 12, labels: answer({ safety: "illness" }), phrases: ["my head is paining me but {n}", "I feel sick, {n}", "my tummy hurts, I think it is {n}", "I am dizzy and it is {n}", "{n}, but I am not feeling well"] },
  { name: "answer-and-fear", says: "right", keep: 6, labels: answer({ safety: "fear" }), phrases: ["I am scared but it is {n}", "{n}, I am frightened", "it is {n}, I am afraid of the noise outside"] },
  { name: "answer-and-grownup", says: "right", keep: 6, labels: answer({ safety: "wants_grownup" }), phrases: ["{n}, please call my mummy", "I think {n}, I want a grown-up", "it is {n}, where is my daddy?"] },
  { name: "sound-alike-answer", says: "word", keep: 24, labels: answer(), phrases: ["{w}", "It is {w}.", "{w} I think", "um, {w}"] },
  { name: "toilet", keep: 12, labels: only({ physical_need: "toilet" }), phrases: ["I need the toilet", "please I want to pee", "I want to poo", "can I go to the toilet?", "excuse me, I need to use the bathroom", "I am pressed, I want to go out", "I need to do number two", "teacher, toilet please"] },
  { name: "water", keep: 12, labels: only({ physical_need: "water" }), phrases: ["I am thirsty", "can I have some water?", "I want to drink water", "please, I need a drink of water", "my throat is dry, can I drink?"] },
  { name: "illness", keep: 10, labels: only({ safety: "illness" }), phrases: ["my tummy hurts", "I feel dizzy", "I am not feeling well", "my head is paining me", "I am feeling sick", "I have a fever", "I want to vomit"] },
  { name: "injury", keep: 10, labels: only({ safety: "injury" }), phrases: ["I fell down and my knee is bleeding", "someone hit me", "I cut my finger", "my brother beat me and it is paining", "I hit my head on the table", "a boy pushed me and my arm is hurt"] },
  { name: "fear", keep: 8, labels: only({ safety: "fear" }), phrases: ["I am afraid", "I am scared", "I am frightened of the dark", "I don't want to be alone, I am scared"] },
  { name: "wants-grownup", keep: 8, labels: only({ safety: "wants_grownup" }), phrases: ["I want my mummy", "please call my teacher", "where is my daddy?", "I need a grown-up", "please call my mother", "I want to talk to my father"] },
  { name: "dont-know", keep: 12, labels: only({ dont_know: true }), phrases: ["I don't know", "I do not know", "I forgot", "I can't remember", "I am not sure", "no idea", "I don't know the answer", "um, I don't know", "I have forgotten it"] },
  { name: "repeat", keep: 12, labels: only({ repeat_request: true }), phrases: ["what did you say?", "say it again please", "I did not hear", "sorry, can you repeat the question?", "pardon?", "what?", "please say the question again", "I didn't hear you"] },
  { name: "garbled", keep: 10, labels: only({ unintelligible: true }), phrases: ["ghh mm bla", "kkkk", "uh hmm shh", "dsf tre", "ba ba ba ba", "hm hm hm", "mm", "pfft grr"] },
  { name: "child-question", keep: 12, labels: only({ child_question: true }), phrases: ["who are you?", "why do we learn this?", "how many more questions are there?", "what does plus mean?", "is this a test?", "are you a real person?", "what is your name?", "will we finish soon?"] },
  { name: "off-topic", keep: 14, labels: only({ off_topic: true }), phrases: ["I am hungry", "I want to play football", "my sister has a new bag", "can we sing a song?", "I like your voice", "today is my birthday", "I saw a big dog on the road", "my friend is at the door"] },
];

/** Sound-alike words a recogniser writes for a number, with the number. */
const SOUND_ALIKES: [string, number][] = [["tree", 3], ["free", 3], ["for", 4], ["fife", 5], ["sicks", 6], ["seben", 7], ["ate", 8], ["nain", 9], ["tin", 10], ["twenny", 20], ["fotty", 40], ["won", 1], ["to", 2]];

/** Whether the words say the number: as digits or as words, with or without a hyphen. A line that does not was not written to its brief. */
export function saysNumber(heard: string, number: number): boolean {
  const words = heard.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  return new RegExp(`(^|[^a-z0-9])(${number}|${numberWords(number)})($|[^a-z0-9])`).test(words);
}

/** The words of a case without case or punctuation: "Ten." and "ten" are one case. */
export const sameWords = (row: Pick<Row, "prompt" | "heard">) => `${row.prompt}\n${row.heard.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()}`;

const bucket = (text: string) => createHash("sha256").update(text).digest("hex");
const shape = (text: string, sentenceCase: boolean) => (sentenceCase ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Every expansion of one template, each with its id. */
function expansions(template: Template): Row[] {
  const rows: Row[] = [];
  PROMPTS.forEach(({ prompt, expected }, promptAt) => {
    template.phrases.forEach((phrase, phraseAt) => {
      const fills = fillsOf(template, expected);
      fills.forEach(({ said, written, key }) => {
        [false, true].forEach((sentenceCase) => {
          const words = shape(phrase.replace("{n}", written).replace("{w}", written), sentenceCase);
          const id = `tpl.${template.name}.p${promptAt}.s${phraseAt}.${key}.${sentenceCase ? "c" : "l"}`;
          rows.push({ id, source: "template", heard: words, prompt, expected, labels: template.labels(said) });
        });
      });
    });
  });
  return rows;
}

function fillsOf(template: Template, expected: number): { said: number | null; written: string; key: string }[] {
  if (template.says === undefined) return [{ said: null, written: "", key: "x" }];
  if (template.says === "word") return SOUND_ALIKES.map(([word, said]) => ({ said, written: word, key: word }));
  const values = template.says === "right" ? [expected] : [expected, expected, expected + 1, expected + 2, Math.max(0, expected - 3)];
  return values.flatMap((value, at) => [
    { said: value, written: numberWords(value), key: `w${value}.${at}` },
    { said: value, written: String(value), key: `d${value}.${at}` },
  ]);
}

/** The cases to keep: for each template, the `keep` expansions with the smallest hash of their id, so every run chooses the same. */
export function templateCases(): Row[] {
  const seen = new Set<string>();
  return TEMPLATES.flatMap((template) =>
    expansions(template)
      .sort((a, b) => bucket(a.id).localeCompare(bucket(b.id)))
      .filter((row) => {
        const text = sameWords(row);
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .slice(0, template.keep),
  );
}
