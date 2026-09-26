import type { Reply } from "./turn";

/** Where a learner's instance keeps the reply it gave each turn. */
export interface KeptReplies {
  get(turn: string): Reply | null;
  /** Keeps a turn's first reply; a later one for the same turn is not kept. */
  put(turn: string, reply: Reply): void;
}

/** The Worker asks for a turn again within the hour; past a day the reply, and the child's words in
 * it, are no longer kept. */
export const REPLY_KEPT_MS = 24 * 60 * 60 * 1000;

/** The instance's SQLite, as the agent's `sql` template runs it. */
export type Sql = (
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => Record<string, unknown>[];

export function keepRepliesTable(sql: Sql): void {
  sql`CREATE TABLE IF NOT EXISTS replies (turn TEXT PRIMARY KEY, reply TEXT NOT NULL, kept_at INTEGER NOT NULL)`;
}

/** Replies kept in the instance's SQLite, those past a day let go whenever one is kept. */
export function repliesIn(sql: Sql, now: () => number = Date.now): KeptReplies {
  return {
    get(turn) {
      const [row] = sql`SELECT reply FROM replies WHERE turn = ${turn}`;
      return row ? (JSON.parse(String(row.reply)) as Reply) : null;
    },
    put(turn, reply) {
      const at = now();
      sql`DELETE FROM replies WHERE kept_at < ${at - REPLY_KEPT_MS}`;
      sql`INSERT OR IGNORE INTO replies (turn, reply, kept_at) VALUES (${turn}, ${JSON.stringify(reply)}, ${at})`;
    },
  };
}

/**
 * One reply per turn. The Worker gives up on a slow teach and asks for the turn again, while the first
 * ask may still be running: the second gets the first's reply, so it never pays for the model twice and
 * never says something other than the verdict already recorded.
 */
export class TurnReplies {
  private readonly running = new Map<string, Promise<Reply>>();

  constructor(private readonly kept: KeptReplies) {}

  reply(turn: string | undefined, take: () => Promise<Reply>): Promise<Reply> {
    if (!turn) return take();
    const stored = this.kept.get(turn);
    if (stored) return Promise.resolve(stored);
    let running = this.running.get(turn);
    if (!running) {
      running = take()
        .then((reply) => {
          this.kept.put(turn, reply);
          return reply;
        })
        .finally(() => this.running.delete(turn));
      this.running.set(turn, running);
    }
    return running;
  }
}
