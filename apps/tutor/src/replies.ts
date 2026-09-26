import type { Reply } from "./turn";

/** Where a learner's instance keeps the reply it gave each turn. */
export interface KeptReplies {
  get(turn: string): Reply | null;
  put(turn: string, reply: Reply): void;
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
