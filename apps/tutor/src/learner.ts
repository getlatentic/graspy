import { Agent, callable } from "agents";
import type { Card } from "ts-fsrs";
import type { Verdict } from "./mark";
import { keepRepliesTable, repliesIn, TurnReplies } from "./replies";
import { keepToldTable, toldIn } from "./told";
import { takeTurn, type Ask, type Reply } from "./turn";
import {
  chooseSitting,
  newMemory,
  remember,
  retrievability,
  type ItemMemory,
  type Sitting,
} from "./schedule";

/**
 * One learner's memory of one curriculum, and what to ask them next.
 *
 * An instance holds a single child, so their rows never mix with a sibling's on a shared phone,
 * and the state lives beside the scheduling that reads it rather than in a table a request away.
 */
export class Learner extends Agent<Env> {
  private ready = false;
  private readonly replies = new TurnReplies(
    repliesIn((strings, ...values) => {
      this.ensure();
      return this.sql(strings, ...values);
    }),
  );

  private readonly told = toldIn((strings, ...values) => {
    this.ensure();
    return this.sql(strings, ...values);
  });

  private ensure(): void {
    if (this.ready) return;
    this.sql`
      CREATE TABLE IF NOT EXISTS memory (
        lesson TEXT NOT NULL,
        item TEXT NOT NULL,
        card TEXT NOT NULL,
        asked_at TEXT NOT NULL,
        PRIMARY KEY (lesson, item)
      )
    `;
    this.sql`CREATE TABLE IF NOT EXISTS applied (turn TEXT PRIMARY KEY)`;
    keepRepliesTable(this.sql.bind(this));
    keepToldTable(this.sql.bind(this));
    this.ready = true;
  }

  private known(lesson: string): ItemMemory[] {
    this.ensure();
    const rows = this.sql<{ item: string; card: string }>`
      SELECT item, card FROM memory WHERE lesson = ${lesson}
    `;
    return rows.map((row) => ({ item: row.item, card: reviveCard(row.card) }));
  }

  private keep(lesson: string, memory: ItemMemory, now: Date): void {
    const card = JSON.stringify(memory.card);
    const asked = now.toISOString();
    this.sql`
      INSERT INTO memory (lesson, item, card, asked_at)
      VALUES (${lesson}, ${memory.item}, ${card}, ${asked})
      ON CONFLICT (lesson, item) DO UPDATE SET card = ${card}, asked_at = ${asked}
    `;
  }

  /** The four to six items to ask now, weakest first, with a little new material behind them. */
  @callable()
  sitting(lesson: string, everyItem: string[], at?: string): Sitting {
    const now = at ? new Date(at) : new Date();
    return chooseSitting(this.known(lesson), everyItem, now);
  }

  /**
   * Record what the marker decided. An unheard turn is stored as if it never happened.
   *
   * A `turn` names the answer this verdict came from, and one answer moves each item once however
   * many times it arrives. The caller retries a failed request, and a review applied twice would
   * space a lesson the learner sat once as if they had sat it twice. One answer does move two
   * items: the fact it was about, and the lesson it belongs to, which are counted separately.
   */
  @callable()
  record(
    lesson: string,
    item: string,
    verdict: Verdict,
    at?: string,
    turn?: string,
  ): { stability: number; applied: boolean } {
    const now = at ? new Date(at) : new Date();
    const existing = this.known(lesson).find((memory) => memory.item === item);
    const before = existing ?? newMemory(item, now);
    const once = turn && [turn, lesson, item].join("\u001f");
    if (once && this.alreadyApplied(once)) {
      return { stability: before.card.stability, applied: false };
    }
    const after = remember(before, verdict, now);
    if (verdict !== "unheard") this.keep(lesson, after, now);
    if (once) this.sql`INSERT INTO applied (turn) VALUES (${once})`;
    return { stability: after.card.stability, applied: verdict !== "unheard" };
  }

  private alreadyApplied(turn: string): boolean {
    this.ensure();
    return this.sql<{ turn: string }>`SELECT turn FROM applied WHERE turn = ${turn}`.length > 0;
  }

  /**
   * Teach one turn: mark what the child said, say something back, and remember what it meant.
   *
   * Marking and remembering live together on purpose. The verdict that reaches the child is the
   * same one that moves the lesson's spacing, so the teacher can never praise an answer it is
   * about to record as a miss.
   */
  @callable()
  async teach(lesson: string, ask: Ask, turn?: string, at?: string): Promise<Reply> {
    return this.replies.reply(turn, async () => {
      const earlier = this.told.before(lesson, ask.prompt);
      const reply = await takeTurn(this.env, earlier.length > 0 ? { ...ask, earlier } : ask);
      this.told.put(lesson, ask.prompt, { verdict: reply.verdict, line: reply.say });
      this.record(lesson, ask.expect.item, reply.verdict, at, turn);
      return reply;
    });
  }

  /**
   * The same methods over plain HTTP, for the Worker that owns the lesson.
   *
   * Callable methods travel over a WebSocket, which suits a browser and not a server. A service
   * binding wants one request and one answer, so this is that door.
   */
  override async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ detail: "method not allowed" }, 405);
    let body: {
      lesson?: string;
      items?: string[];
      item?: string;
      verdict?: Verdict;
      at?: string;
      turn?: string;
      ask?: Ask;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "a JSON body is required" }, 400);
    }
    const action = new URL(request.url).pathname.split("/").pop();
    if (action === "forget") {
      await this.forget();
      return json({ forgotten: true });
    }
    const lesson = body.lesson;
    if (!lesson) return json({ detail: "lesson is required" }, 400);

    if (action === "sitting") {
      if (!Array.isArray(body.items)) return json({ detail: "items is required" }, 400);
      return json(this.sitting(lesson, body.items, body.at));
    }
    if (action === "record") {
      if (!body.item || !body.verdict) return json({ detail: "item and verdict are required" }, 400);
      return json(this.record(lesson, body.item, body.verdict, body.at, body.turn));
    }
    if (action === "standing") {
      return json({ items: this.standing(lesson, body.at) });
    }
    if (action === "teach") {
      if (!body.ask?.expect?.item) return json({ detail: "ask.expect.item is required" }, 400);
      try {
        return json(await this.teach(lesson, body.ask, body.turn, body.at));
      } catch (error) {
        return json({ detail: (error as Error).message }, 502);
      }
    }
    return json({ detail: "unknown action" }, 404);
  }

  /** Everything this learner's instance holds, when the learner is removed from their account. */
  async forget(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.ready = false;
  }

  /** How solid every item of a lesson is right now, for the board the learner sees. */
  @callable()
  standing(lesson: string, at?: string): { item: string; recall: number }[] {
    const now = at ? new Date(at) : new Date();
    return this.known(lesson)
      .map((memory) => ({ item: memory.item, recall: retrievability(memory, now) }))
      .sort((left, right) => left.recall - right.recall);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reviveCard(stored: string): Card {
  const card = JSON.parse(stored) as Card;
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined };
}
