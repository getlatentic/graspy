import book from "../../../content/teacher-phrasebook.json";

/** Praise for a right answer, by what was answered: anything, a number, a list said in order. */
export const RIGHT: string[] = book.right;
export const RIGHT_NUMBER: string[] = book.right_number;
export const RIGHT_LIST: string[] = book.right_list;
/** When the child said it after the teacher: they took part, and they have not yet shown it alone. */
export const RIGHT_WITH_YOU: string[] = book.right_with_you;

/** A phrasebook line with the number the child said written into it. */
export function withNumber(line: string, words: string): string {
  return line.replace("{number}", words).replace("{Number}", words[0].toUpperCase() + words.slice(1));
}

/** The lines that show the model how this teacher sounds, one example set per moment in a lesson. */
export function exampleBlock(): string[] {
  return Object.entries(book.examples).flatMap(([moment, lines]) => lines.map((line) => `- ${moment}: "${line}"`));
}

/** Every line the phrasebook can say, with a number filled in where it takes one, for checking them all. */
export function allLines(numberWords: string): string[] {
  return [...RIGHT, ...RIGHT_LIST, ...RIGHT_WITH_YOU, ...RIGHT_NUMBER.map((line) => withNumber(line, numberWords)), ...Object.values(book.examples).flat()];
}
