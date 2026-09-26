import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { keepRepliesTable, REPLY_KEPT_MS, repliesIn, TurnReplies, type Sql } from "../src/replies";
import type { Reply } from "../src/turn";

const WELL_DONE: Reply = { verdict: "correct", expected: "9", said: "9", say: "Well done." };
const AGAIN: Reply = { verdict: "wrong", expected: "9", said: "8", say: "Say it again." };

function replies() {
  const kept = new Map<string, Reply>();
  const turns = new TurnReplies({
    get: (turn) => kept.get(turn) ?? null,
    put: (turn, reply) => void kept.set(turn, reply),
  });
  return { kept, turns };
}

describe("a turn asked again", () => {
  it("gets the reply it was given, without the model", async () => {
    const { turns } = replies();
    let asked = 0;
    const take = async () => (asked += 1) === 1 ? WELL_DONE : AGAIN;

    await expect(turns.reply("gvm_1", take)).resolves.toEqual(WELL_DONE);
    await expect(turns.reply("gvm_1", take)).resolves.toEqual(WELL_DONE);
    expect(asked).toBe(1);
  });

  it("while its first ask still runs, waits for that reply", async () => {
    const { turns } = replies();
    let asked = 0;
    let answer = (_: Reply) => {};
    const take = () => {
      asked += 1;
      return new Promise<Reply>((resolve) => (answer = resolve));
    };

    const first = turns.reply("gvm_1", take);
    const retry = turns.reply("gvm_1", take);
    answer(WELL_DONE);
    await expect(Promise.all([first, retry])).resolves.toEqual([WELL_DONE, WELL_DONE]);
    expect(asked).toBe(1);
  });

  it("is taken afresh when its first ask failed", async () => {
    const { kept, turns } = replies();
    await expect(turns.reply("gvm_1", async () => Promise.reject(new Error("the model failed")))).rejects.toThrow();
    await expect(turns.reply("gvm_1", async () => WELL_DONE)).resolves.toEqual(WELL_DONE);
    expect(kept.get("gvm_1")).toEqual(WELL_DONE);
  });

  it("is not kept when it names no turn", async () => {
    const { kept, turns } = replies();
    await turns.reply(undefined, async () => WELL_DONE);
    expect(kept.size).toBe(0);
  });
});

describe("the replies an instance keeps", () => {
  function stored(now: () => number) {
    const db = new DatabaseSync(":memory:");
    const sql: Sql = (strings, ...values) => db.prepare(strings.join("?")).all(...values);
    keepRepliesTable(sql);
    return { kept: repliesIn(sql, now), turns: () => sql`SELECT turn FROM replies ORDER BY turn` };
  }

  it("keep a turn's first reply as it was given, never a later one", () => {
    const { kept } = stored(() => 0);
    kept.put("gvm_1", WELL_DONE);
    kept.put("gvm_1", AGAIN);
    expect(kept.get("gvm_1")).toEqual(WELL_DONE);
  });

  it("let go of replies past a day whenever one is kept", () => {
    let now = 0;
    const { kept, turns } = stored(() => now);
    kept.put("gvm_old", WELL_DONE);
    now = REPLY_KEPT_MS / 2;
    kept.put("gvm_recent", WELL_DONE);
    now = REPLY_KEPT_MS + 1;
    kept.put("gvm_new", AGAIN);

    expect(turns()).toEqual([{ turn: "gvm_new" }, { turn: "gvm_recent" }]);
    expect(kept.get("gvm_old")).toBeNull();
  });

  it("give a turn asked again its stored reply", async () => {
    const turns = new TurnReplies(stored(() => 0).kept);
    await turns.reply("gvm_1", async () => WELL_DONE);
    await expect(turns.reply("gvm_1", async () => AGAIN)).resolves.toEqual(WELL_DONE);
  });
});
