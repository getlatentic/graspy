import { describe, expect, it } from "vitest";
import { Cursor, parseFrame, type Frame } from "./frames";

const text = (seq: number, prev: number): Frame => ({
  seq,
  prev,
  kind: "text",
  text: "x",
});

describe("parseFrame", () => {
  it("reads each kind the server sends", () => {
    expect(parseFrame({ seq: 4, prev: 3, kind: "text", text: "Yes" })).toEqual({
      seq: 4,
      prev: 3,
      kind: "text",
      text: "Yes",
    });
    expect(
      parseFrame({ seq: 5, prev: 4, kind: "tool.started", tool: "calculate" }),
    ).toMatchObject({ kind: "tool.started", tool: "calculate" });
    expect(
      parseFrame({
        seq: 6,
        prev: 5,
        kind: "tool.cancelled",
        tool: "calculate",
      }),
    ).toMatchObject({ kind: "tool.cancelled" });
    expect(
      parseFrame({ seq: 7, prev: 6, kind: "round.aborted" }),
    ).toMatchObject({
      kind: "round.aborted",
      reason: "",
    });
    expect(parseFrame({ seq: 8, prev: 7, kind: "turn.resumed" })).toMatchObject(
      {
        kind: "turn.resumed",
      },
    );
    expect(parseFrame({ kind: "reset" })).toEqual({ kind: "reset" });
  });

  it("reads the end of a turn with its reply or its cause", () => {
    expect(
      parseFrame({
        seq: 9,
        prev: 8,
        kind: "turn.finished",
        status: "ok",
        reply: { answer: "Yes.", data: { followUps: [] } },
      }),
    ).toMatchObject({ status: "ok", reply: { answer: "Yes." } });
    expect(
      parseFrame({
        seq: 9,
        prev: 8,
        kind: "turn.finished",
        status: "failed",
        cause: "no_progress",
      }),
    ).toMatchObject({
      status: "failed",
      cause: "no_progress",
      reply: undefined,
    });
  });

  it.each([
    null,
    "text",
    [],
    { kind: "text", text: "x" },
    { seq: 1.5, prev: 0, kind: "text", text: "x" },
    { seq: 4, prev: 3, kind: "text" },
    { seq: 4, prev: 3, kind: "tool" },
    { seq: 4, prev: 3, kind: "turn.finished", status: "done" },
    { seq: 4, prev: 3, kind: "mystery" },
  ])("drops what the server would not send: %j", (raw) => {
    expect(parseFrame(raw)).toBeNull();
  });
});

describe("Cursor", () => {
  it("applies the frame that follows the cursor and moves on", () => {
    const cursor = new Cursor(3);

    expect(cursor.take(text(5, 3))).toBe("apply");
    expect(cursor.at).toBe(5);
  });

  it("skips a frame at or below the cursor, the cursor staying", () => {
    const cursor = new Cursor(5);

    expect(cursor.take(text(5, 3))).toBe("skip");
    expect(cursor.take(text(4, 3))).toBe("skip");
    expect(cursor.at).toBe(5);
  });

  it("calls a frame that does not follow the cursor a gap, the cursor staying", () => {
    const cursor = new Cursor(3);

    expect(cursor.take(text(7, 6))).toBe("gap");
    expect(cursor.at).toBe(3);
  });

  it("says reset", () => {
    expect(new Cursor(3).take({ kind: "reset" })).toBe("reset");
  });
});
