import { describe, expect, it } from "vitest";
import {
  chatToReturnTo,
  lessonMadeInChat,
  lessonRequested,
} from "./lesson-opening";

describe("a lesson a card asks to open", () => {
  it("is one of the app's own, by its path", () => {
    expect(lessonRequested("/app/learn/real-analysis/lesson/3")).toEqual({
      path: "/app/learn/real-analysis/lesson/3",
    });
  });

  it("names the lesson the chat made for it", () => {
    expect(lessonRequested("/app/learn/maths/lesson/0?lesson=abc123")).toEqual({
      path: "/app/learn/maths/lesson/0",
      lessonId: "abc123",
    });
  });

  it("is read with the slug as the app escapes it", () => {
    expect(lessonRequested("/app/learn/analyse-r%C3%A9elle/lesson/2")).toEqual({
      path: "/app/learn/analyse-r%C3%A9elle/lesson/2",
    });
  });

  it.each([
    "https://evil.example/app/learn/maths/lesson/0",
    "//evil.example/app/learn/maths/lesson/0",
    "/app/learn/maths",
    "/app/learn/maths/lesson/zero",
    "/app/learn/maths/lesson/0/extra",
    "/app/learn/a/b/lesson/0",
    "/app/you",
    "/app/learn/maths/lesson/0#x",
    "javascript:alert(1)",
    "",
  ])("is not followed when it is %s", (url) => {
    expect(lessonRequested(url)).toBeNull();
  });

  it("drops a lesson id that is not the length of one", () => {
    expect(
      lessonRequested(`/app/learn/maths/lesson/0?lesson=${"x".repeat(81)}`),
    ).toEqual({ path: "/app/learn/maths/lesson/0" });
  });
});

describe("what a lesson page reads of how it was opened", () => {
  it("returns to the chat it was opened from, a place in the app", () => {
    expect(chatToReturnTo({ backToChat: "/try" })).toEqual({
      backToChat: "/try",
    });
    expect(
      chatToReturnTo({ backToChat: "/app/learn/ask/general?x=1" }),
    ).toEqual({ backToChat: "/app/learn/ask/general?x=1" });
  });

  it.each([
    null,
    undefined,
    {},
    { backToChat: 3 },
    { backToChat: "https://evil.example" },
    { backToChat: "//evil.example" },
    { backToChat: "try" },
  ])("has no chat to return to for %j", (state) => {
    expect(chatToReturnTo(state)).toEqual({});
  });

  it("opens the lesson the chat made, when it names one", () => {
    expect(lessonMadeInChat({ lessonId: "abc" })).toBe("abc");
    expect(lessonMadeInChat({ lessonId: "x".repeat(81) })).toBeUndefined();
    expect(lessonMadeInChat(null)).toBeUndefined();
    expect(lessonMadeInChat({ lessonId: 4 })).toBeUndefined();
  });
});
