// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { chatPathOf, rememberChat, takeChat } from "./chat-return";

beforeEach(() => window.sessionStorage.clear());

describe("the chat a visitor asked for", () => {
  it.each([
    "/app/learn/ask",
    "/app/learn/ask/mathematics/2",
    "/app/learn/ask/subject/mathematics?draft=1",
  ])("is kept for %s and given back once", (path) => {
    rememberChat(path);

    expect(takeChat()).toBe(path);
    expect(takeChat()).toBeNull();
  });

  it.each([
    "/app/learn",
    "/app/learn/voice",
    "/app/learn/asked",
    "https://elsewhere.example/app/learn/ask",
    "//elsewhere.example",
    "/app/learn/ask//elsewhere.example",
    "/app/learn/ask/../you",
  ])("is not kept for %s: only a chat may be returned to", (path) => {
    expect(chatPathOf(path)).toBeNull();
    rememberChat(path);

    expect(takeChat()).toBeNull();
  });

  it("is forgotten after half an hour, so a later sign-in does not open a chat", () => {
    rememberChat("/app/learn/ask", 1_000);

    expect(takeChat(1_000 + 31 * 60_000)).toBeNull();
  });

  it("is given back within half an hour", () => {
    rememberChat("/app/learn/ask", 1_000);

    expect(takeChat(1_000 + 29 * 60_000)).toBe("/app/learn/ask");
  });

  it("is nothing when storage holds something else", () => {
    window.sessionStorage.setItem("graspy.chat-return", "{not json");

    expect(takeChat()).toBeNull();
  });
});
