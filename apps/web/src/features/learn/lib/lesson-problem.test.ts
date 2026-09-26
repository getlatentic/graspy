import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, SignInUnchecked } from "@/lib/api/errors";
import { lessonFailure, lessonProblem } from "./lesson-problem";

let online = true;

beforeEach(() => {
  online = true;
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
});

function problemAfter(error: unknown) {
  return lessonProblem({
    loaded: true,
    hasSubject: true,
    hasTarget: true,
    failure: lessonFailure(error),
    online,
  });
}

describe("a lesson that did not open", () => {
  it("says graspy cannot be reached when it could not be", () => {
    expect(problemAfter(new NetworkError("Failed to fetch"))).toEqual({
      key: "lesson.problem.unreachable",
      retryable: true,
    });
  });

  it.each([
    ["nothing could be fetched", new TypeError("Failed to fetch")],
    [
      "Google could not check the sign-in",
      new SignInUnchecked("auth/internal-error", 503),
    ],
  ])("says the device is offline when it is and %s", (_, error) => {
    online = false;

    expect(problemAfter(error)).toEqual({
      key: "lesson.problem.offline",
      retryable: true,
    });
  });

  it.each([
    ["graspy refused the session", new ApiError("refused", 403)],
    [
      "graspy issued an empty session",
      new ApiError("The server issued an empty session", 200),
    ],
    ["graspy refused the lesson", new Error("give_lesson was refused")],
    [
      "Google could not check the sign-in",
      new SignInUnchecked("auth/too-many-requests", 429),
    ],
  ])("says only that it did not load when %s", (_, error) => {
    expect(problemAfter(error)).toEqual({ key: null, retryable: true });
  });
});

it("is no problem while the lesson opens", () => {
  expect(
    lessonProblem({
      loaded: true,
      hasSubject: true,
      hasTarget: true,
      failure: null,
      online,
    }),
  ).toBeNull();
});
