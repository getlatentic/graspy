import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import { PATH_UI, pathAnswerSummary, replacedPathCards } from "./path-card";

let n = 0;
const card = (resourceUri: string): ChatMessage["metadata"] => ({
  card: {
    resourceUri,
    toolName: "x",
    toolInput: {},
    toolResult: { content: [] },
  },
});
const message = (
  sender: "ai" | "user",
  content: string,
  resourceUri?: string,
): ChatMessage => ({
  id: `m${n++}`,
  threadId: "t",
  type: sender === "user" ? "user" : "system",
  content,
  timestamp: n,
  sender,
  ...(resourceUri ? { metadata: card(resourceUri) } : {}),
});
const path = () => message("ai", "Here is a path.", PATH_UI);
const said = (text: string) => message("user", text);
const replaced = (messages: ChatMessage[]) =>
  messages.filter((m) => replacedPathCards(messages).has(m.id));

describe("the learner's answer to a path card", () => {
  it("is read as the courses and how many topics were kept", () => {
    expect(
      pathAnswerSummary(
        "Add to my plan:\nCourse: Real analysis\n- Limits | SS 3\n- Series | SS 4\nCourse: Chess\n- Openings | ",
      ),
    ).toEqual({ subjects: "Real analysis, Chess", count: 3 });
  });

  it.each([
    "Add to my plan: real analysis please",
    "Add to my plan:",
    "Course: Real analysis\n- Limits",
    "",
  ])("is not read from %j, which is the learner's own words", (content) => {
    expect(pathAnswerSummary(content)).toBeNull();
  });
});

describe("the path cards of a conversation", () => {
  it("keep a single card", () => {
    expect(replaced([said("real analysis"), path()])).toEqual([]);
  });

  it("give way to the card that comes of what the learner said was missing", () => {
    const first = path();
    const second = path();

    expect(
      replaced([said("real analysis"), first, said("black holes"), second]),
    ).toEqual([first]);
  });

  it("give way through every change, leaving only the last", () => {
    const [a, b, c] = [path(), path(), path()];

    expect(
      replaced([said("x"), a, said("more"), b, said("more again"), c]),
    ).toEqual([a, b]);
  });

  it("keep a card the learner answered, showing what they chose, beside a later one", () => {
    const answered = path();
    const later = path();

    expect(
      replaced([
        said("real analysis"),
        answered,
        said("Add to my plan:\nCourse: Real analysis\n- Limits | SS 3"),
        message("ai", "Starting with limits."),
        said("and quantum computing"),
        later,
      ]),
    ).toEqual([]);
  });

  it("replace an unanswered card even after an answered one came between", () => {
    const [a, b, c] = [path(), path(), path()];

    expect(
      replaced([
        said("x"),
        a,
        said("more"),
        b,
        said("Add to my plan:\nCourse: X\n- Y | Z"),
        c,
      ]),
    ).toEqual([a]);
  });

  it("do not count cards of other kinds, or a learner's own message that holds one", () => {
    const choice = message("ai", "Which?", "ui://graspy/choice");
    const mine = message("user", "x");
    mine.metadata = card(PATH_UI);

    expect(replaced([choice, path(), mine])).toEqual([]);
  });
});
