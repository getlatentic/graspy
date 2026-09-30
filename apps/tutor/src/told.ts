import type { Sql } from "./replies";
import type { Verdict } from "./mark";

/** What the teacher said to a child for one question, and how the answer was marked. */
export interface Told {
  verdict: Verdict;
  line: string;
}

/** Only the last few tries at a question are remembered, and only a while: it is one sitting's memory. */
export const TOLD_KEPT = 4;
export const TOLD_WINDOW_MS = 30 * 60 * 1000;
export const TOLD_PURGE_MS = 24 * 60 * 60 * 1000;

export interface KeptTold {
  /** The lines said for this question in the last while, oldest first. */
  before(lesson: string, question: string): Told[];
  put(lesson: string, question: string, told: Told): void;
}

export function keepToldTable(sql: Sql): void {
  sql`CREATE TABLE IF NOT EXISTS told (lesson TEXT NOT NULL, question TEXT NOT NULL, verdict TEXT NOT NULL, line TEXT NOT NULL, told_at INTEGER NOT NULL)`;
}

/**
 * The teacher's own lines, kept in the learner's instance so that a repeat of a question is answered
 * knowing what was said last time. The child's words are not kept here, only what was said back, which
 * may say their answer again; a row is let go past a day, or when the learner is forgotten.
 */
export function toldIn(sql: Sql, now: () => number = Date.now): KeptTold {
  return {
    before(lesson, question) {
      const rows = sql`SELECT verdict, line FROM told WHERE lesson = ${lesson} AND question = ${question} AND told_at >= ${now() - TOLD_WINDOW_MS} ORDER BY told_at DESC, rowid DESC LIMIT ${TOLD_KEPT}`;
      return rows.reverse().map((row) => ({ verdict: String(row.verdict) as Verdict, line: String(row.line) }));
    },
    put(lesson, question, told) {
      const at = now();
      sql`DELETE FROM told WHERE told_at < ${at - TOLD_PURGE_MS}`;
      sql`INSERT INTO told (lesson, question, verdict, line, told_at) VALUES (${lesson}, ${question}, ${told.verdict}, ${told.line}, ${at})`;
    },
  };
}

/** A line as it is compared for repeating: case, punctuation and spacing do not make it another line. */
export const sameLine = (a: string, b: string): boolean => normal(a) === normal(b);
const normal = (line: string) => line.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
