import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  ChatGone,
  followTurn,
  Left,
  backoff,
  type FrameListener,
} from "./follow";
import type { Finished, Frame } from "./frames";
import { LinkFailed, type Link, type LinkKind } from "./links";

// A scripted turn, as the server keeps it: seqs 1 (started) and 9 (the exchange) are not sent.
const STARTED = 1;
const SERVED: Frame[] = [
  { seq: 2, prev: 1, kind: "turn.resumed" },
  { seq: 3, prev: 2, kind: "text", text: "Fort" },
  { seq: 4, prev: 3, kind: "tool.started", tool: "calculate" },
  { seq: 5, prev: 4, kind: "tool", tool: "calculate" },
  { seq: 6, prev: 5, kind: "round.aborted", reason: "rewritten" },
  { seq: 7, prev: 6, kind: "text", text: "Forty" },
  { seq: 8, prev: 7, kind: "text", text: "-two" },
  {
    seq: 10,
    prev: 8,
    kind: "turn.finished",
    status: "ok",
    reply: { answer: "Forty-two", data: {} },
  },
];

/** What the server sends after a cursor: the frames after it, chained from it. */
function after(cursor: number): Frame[] {
  let prev = cursor;
  return SERVED.filter((frame) => "seq" in frame && frame.seq > cursor).map(
    (frame) => {
      const sent = { ...frame, prev } as Frame;
      prev = (frame as { seq: number }).seq;
      return sent;
    },
  );
}

/** What a page shows: the words, the tool it names, and how many times the answer was rewritten. */
class Page implements FrameListener {
  text = "";
  tool: string | null = null;
  rewrites = 0;
  words: string[] = [];
  reconnecting: boolean[] = [];

  onText = (text: string) => {
    this.text += text;
    this.words.push(text);
  };
  onRestart = () => {
    this.text = "";
    this.rewrites += 1;
  };
  onActivity = (tool: string | null) => {
    this.tool = tool;
  };
  onReconnecting = (on: boolean) => {
    this.reconnecting.push(on);
  };
  shown() {
    return {
      text: this.text,
      tool: this.tool,
      rewrites: this.rewrites,
      words: this.words,
    };
  }
}

type Cut = (connection: number) => number | undefined;

/** A server whose connections are cut after the number of frames `cut` says for each. */
function server(cut: Cut = () => undefined) {
  const opened: { kind: LinkKind; fresh: boolean; after: number }[] = [];
  const link = (kind: LinkKind, fresh: boolean): Link => ({
    async *frames(cursor, _signal, onOpen) {
      const connection = opened.length;
      opened.push({ kind, fresh, after: cursor });
      onOpen?.();
      const limit = cut(connection);
      let sent = 0;
      for (const frame of after(cursor)) {
        if (limit !== undefined && sent >= limit) {
          throw new LinkFailed("The connection was cut", true);
        }
        sent += 1;
        yield frame;
      }
    },
  });
  return { link, opened };
}

const noWait = async () => {};

function follow(
  link: (kind: LinkKind, fresh: boolean) => Link,
  page = new Page(),
) {
  const leave = new AbortController();
  return {
    page,
    leave,
    done: followTurn({
      cursor: STARTED,
      link,
      listener: page,
      signal: leave.signal,
      sleep: noWait,
      showReconnectingAfterMs: 0,
    }),
  };
}

async function uninterrupted() {
  const { link } = server();
  const run = follow(link);
  const finished = await run.done;
  return { finished, shown: run.page.shown() };
}

describe("followTurn", () => {
  it("shows a turn that was never cut", async () => {
    const { finished, shown } = await uninterrupted();

    expect(finished.status).toBe("ok");
    expect(finished.reply?.answer).toBe("Forty-two");
    expect(shown).toEqual({
      text: "Forty-two",
      tool: "calculate",
      rewrites: 1,
      words: ["Fort", "Forty", "-two"],
    });
  });

  it.each(SERVED.map((_, n) => n))(
    "ends with the same page when the socket is dropped after %i frames",
    async (frames) => {
      const whole = await uninterrupted();
      const { link, opened } = server((connection) =>
        connection === 0 ? frames : undefined,
      );

      const run = follow(link);
      const finished = await run.done;

      expect(finished).toEqual(whole.finished);
      expect(run.page.shown()).toEqual(whole.shown);
      expect(opened.length).toBe(frames < SERVED.length ? 2 : 1);
    },
  );

  it("ends with the same page when every connection is dropped after one frame", async () => {
    const whole = await uninterrupted();
    const { link, opened } = server(() => 1);

    const run = follow(link);
    const finished = await run.done;

    expect(finished).toEqual(whole.finished);
    expect(run.page.shown()).toEqual(whole.shown);
    expect(opened.length).toBe(SERVED.length);
  });

  it("asks again from the last frame it applied", async () => {
    const { link, opened } = server((connection) =>
      connection < 2 ? 2 : undefined,
    );

    await follow(link).done;

    expect(opened.map((open) => open.after)).toEqual([1, 3, 5]);
  });

  it("applies a frame sent twice once", async () => {
    const whole = await uninterrupted();
    const doubled = (): Link => ({
      async *frames(cursor) {
        for (const frame of after(cursor)) {
          yield frame;
          yield frame;
        }
      },
    });

    const run = follow(doubled);
    await run.done;

    expect(run.page.shown()).toEqual(whole.shown);
  });

  it("asks again when a frame was lost", async () => {
    const whole = await uninterrupted();
    let connection = 0;
    const lossy = (): Link => ({
      async *frames(cursor) {
        const lose = connection++ === 0;
        for (const frame of after(cursor)) {
          // The text of seq 3 is lost in the first connection.
          if (lose && "seq" in frame && frame.seq === 3) continue;
          yield frame;
        }
      },
    });

    const run = follow(lossy);
    await run.done;

    expect(run.page.shown()).toEqual(whole.shown);
    expect(connection).toBe(2);
  });

  it("goes to server-sent events when the socket twice fails to open", async () => {
    const asked: { kind: LinkKind; fresh: boolean }[] = [];
    const refusing = (kind: LinkKind, fresh: boolean): Link => {
      asked.push({ kind, fresh });
      if (kind === "events") return server().link(kind, fresh);
      return {
        // eslint-disable-next-line require-yield
        async *frames() {
          throw new LinkFailed("The socket did not open", false);
        },
      };
    };

    const run = follow(refusing);
    const finished = await run.done;

    expect(finished.status).toBe("ok");
    expect(asked).toEqual([
      { kind: "socket", fresh: false },
      { kind: "socket", fresh: true },
      { kind: "events", fresh: false },
    ]);
    expect(run.page.text).toBe("Forty-two");
  });

  it("keeps trying the socket while it opens and then drops", async () => {
    const { link, opened } = server((connection) =>
      connection < 4 ? 0 : undefined,
    );

    await follow(link).done;

    expect(opened.map((open) => open.kind)).toEqual(Array(5).fill("socket"));
  });

  it("says it is reconnecting while the connection is down, and not after", async () => {
    let connection = 0;
    const flaky = (): Link => ({
      async *frames(cursor, _signal, onOpen) {
        if (connection++ === 0) throw new LinkFailed("down", false);
        onOpen?.();
        yield* after(cursor);
      },
    });
    const page = new Page();
    const leave = new AbortController();

    await followTurn({
      cursor: STARTED,
      link: flaky,
      listener: page,
      signal: leave.signal,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
      showReconnectingAfterMs: 0,
    });

    expect(page.reconnecting).toEqual([true, false]);
  });

  it("does not say it is reconnecting for a blink", async () => {
    const { link } = server((connection) => (connection === 0 ? 2 : undefined));
    const page = new Page();

    await followTurn({
      cursor: STARTED,
      link,
      listener: page,
      signal: new AbortController().signal,
      sleep: noWait,
      showReconnectingAfterMs: 60_000,
    });

    expect(page.reconnecting).toEqual([]);
  });

  it("tells the page the chat is gone when the cursor is beyond it", async () => {
    const gone = (): Link => ({
      // eslint-disable-next-line require-yield
      async *frames() {
        yield { kind: "reset" } as Frame;
      },
    });

    await expect(follow(gone).done).rejects.toBeInstanceOf(ChatGone);
  });

  it("stops following when the page leaves", async () => {
    const { link } = server(() => 0);
    const run = follow(link);
    run.leave.abort();

    await expect(run.done).rejects.toBeInstanceOf(Left);
  });

  it("gives up on a turn the server must have given up on", async () => {
    let now = 0;
    const down = (): Link => ({
      // eslint-disable-next-line require-yield
      async *frames() {
        now += 5 * 60 * 1000;
        throw new LinkFailed("down", false);
      },
    });

    await expect(
      followTurn({
        cursor: STARTED,
        link: down,
        listener: new Page(),
        signal: new AbortController().signal,
        sleep: noWait,
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("returns the end of a failed or stopped turn as it is", async () => {
    const ended = (status: "failed" | "stopped"): Link => ({
      async *frames(cursor) {
        yield {
          seq: cursor + 1,
          prev: cursor,
          kind: "turn.finished",
          status,
          cause: "no_progress",
          reply: { answer: "Fort", data: {} },
        } satisfies Finished;
      },
    });

    const failed = await follow(() => ended("failed")).done;
    const stopped = await follow(() => ended("stopped")).done;

    expect([failed.status, stopped.status]).toEqual(["failed", "stopped"]);
  });

  it("clears the tool a stop cancelled", async () => {
    const cancelled = (): Link => ({
      async *frames() {
        yield {
          seq: 2,
          prev: 1,
          kind: "tool.started",
          tool: "calculate",
        } as Frame;
        yield {
          seq: 3,
          prev: 2,
          kind: "tool.cancelled",
          tool: "calculate",
        } as Frame;
        yield {
          seq: 4,
          prev: 3,
          kind: "turn.finished",
          status: "stopped",
          reply: { answer: "", data: {} },
        } as Frame;
      },
    });

    const run = follow(cancelled);
    await run.done;

    expect(run.page.tool).toBeNull();
  });
});

describe("backoff", () => {
  it("doubles from a quarter second to five, spread about it", () => {
    const middle = () => 0.5;

    expect(
      [1, 2, 3, 4, 5, 6, 9].map((attempt) => backoff(attempt, middle)),
    ).toEqual([250, 500, 1000, 2000, 4000, 5000, 5000]);
    expect(backoff(1, () => 0)).toBe(188);
    expect(backoff(1, () => 1)).toBe(313);
  });
});
