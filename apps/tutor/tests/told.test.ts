import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Sql } from "../src/replies";
import { keepToldTable, sameLine, TOLD_KEPT, TOLD_PURGE_MS, TOLD_WINDOW_MS, toldIn } from "../src/told";

function stored(now: () => number) {
  const db = new DatabaseSync(":memory:");
  const sql: Sql = (strings, ...values) => db.prepare(strings.join("?")).all(...values);
  keepToldTable(sql);
  return { told: toldIn(sql, now), rows: () => sql`SELECT line FROM told ORDER BY told_at, rowid` };
}

describe("what the teacher said to a child about a question", () => {
  it("is remembered oldest first, so the next reply knows it", () => {
    const { told } = stored(() => 0);
    told.put("counting", "Count to five.", { verdict: "unheard", line: "It is all right." });
    told.put("counting", "Count to five.", { verdict: "wrong", line: "Say one, two." });

    expect(told.before("counting", "Count to five.")).toEqual([
      { verdict: "unheard", line: "It is all right." },
      { verdict: "wrong", line: "Say one, two." },
    ]);
  });

  it("is kept apart by lesson and by question", () => {
    const { told } = stored(() => 0);
    told.put("counting", "Count to five.", { verdict: "wrong", line: "A" });

    expect(told.before("counting", "Count to ten.")).toEqual([]);
    expect(told.before("days", "Count to five.")).toEqual([]);
  });

  it("holds only the last few tries", () => {
    let now = 0;
    const { told } = stored(() => now);
    for (let i = 0; i < TOLD_KEPT + 2; i += 1) {
      now += 1;
      told.put("l", "q", { verdict: "wrong", line: `line ${i}` });
    }

    expect(told.before("l", "q").map((entry) => entry.line)).toEqual(["line 2", "line 3", "line 4", "line 5"]);
  });

  it("is one sitting's memory: a try from long ago is not brought back", () => {
    let now = 0;
    const { told } = stored(() => now);
    told.put("l", "q", { verdict: "wrong", line: "long ago" });
    now = TOLD_WINDOW_MS + 1;

    expect(told.before("l", "q")).toEqual([]);
  });

  it("is let go past a day whenever a line is kept", () => {
    let now = 0;
    const { told, rows } = stored(() => now);
    told.put("l", "q", { verdict: "wrong", line: "old" });
    now = TOLD_PURGE_MS + 1;
    told.put("l", "q", { verdict: "wrong", line: "new" });

    expect(rows().map((row) => row.line)).toEqual(["new"]);
  });
});

describe("a line said again", () => {
  it("is the same line whatever its case, punctuation or spacing", () => {
    expect(sameLine("It's all right, let's try.", "its ALL right;  lets try")).toBe(false);
    expect(sameLine("That is all right. Let us try.", "that is ALL right,  let us try!")).toBe(true);
    expect(sameLine("Say one.", "Say two.")).toBe(false);
  });
});
