import book from "../../../content/teacher-phrasebook.json";

/** Praise for a right answer, by what was answered: anything, a number, a list said in order. */
export const RIGHT: string[] = book.right;
export const RIGHT_NUMBER: string[] = book.right_number;
export const RIGHT_LIST: string[] = book.right_list;
/** When the child said it after the teacher: they took part, and they have not yet shown it alone. */
export const RIGHT_WITH_YOU: string[] = book.right_with_you;
/** When a number was asked for and the child gave another: the right one, said for them to say after the teacher. */
export const WRONG_NUMBER: string[] = book.wrong_number;
/** When the child was asked for the next item before being told it and was wrong: only that it was not it. */
export const NOT_QUITE: string[] = book.not_quite;

/** A phrasebook line with the number the child said written into it. */
export function withNumber(line: string, words: string): string {
  return line.replaceAll("{number}", words).replaceAll("{Number}", words[0].toUpperCase() + words.slice(1));
}

const DID_NOT_HEAR = "when the phone did not hear them";

/**
 * The lines that show the model how this teacher sounds, one example set per moment in a lesson. When the
 * words were heard and were "I do not know", the example for a recording nobody heard is left out, for a model
 * shown it uses it; when nothing was heard, only that one is shown.
 */
export function exampleBlock(heard: "nothing" | "dont_know" | "words" = "words"): string[] {
  return Object.entries(book.examples)
    .filter(([moment]) => (heard === "dont_know" ? moment !== DID_NOT_HEAR : heard === "nothing" ? moment === DID_NOT_HEAR : true))
    .flatMap(([moment, lines]) => lines.map((line) => `- ${moment}: "${line}"`));
}

/** An example with its <slots> filled by a short word, for checking it as a line. */
export function withoutSlots(line: string): string {
  return line.replace(/<[^>]+>/g, "seven");
}

/** Every line the phrasebook can say, with a number filled in where it takes one, for checking them all. */
export function allLines(numberWords: string): string[] {
  return [...RIGHT, ...RIGHT_LIST, ...RIGHT_WITH_YOU, ...WRONG_NUMBER.map((line) => withNumber(line, numberWords)), ...NOT_QUITE, ...RIGHT_NUMBER.map((line) => withNumber(line, numberWords)), ...Object.values(book.examples).flat().map(withoutSlots)];
}
