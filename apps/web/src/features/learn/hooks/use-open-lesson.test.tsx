// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const plan = vi.hoisted(() => ({
  curriculum: {
    subjects: [
      { name: "Real analysis", slug: "real-analysis" },
      { name: "Maths", slug: "maths" },
    ],
  },
}));
vi.mock("../learner-context", () => ({ usePlan: () => plan }));

const { useOpenLesson } = await import("./use-open-lesson");

function at(path: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ open: useOpenLesson(), location: useLocation() }),
    { wrapper },
  );
}

afterEach(cleanup);

describe("opening a lesson from a card in the chat", () => {
  it("goes to the lesson with the way back to the chat the visitor was in", () => {
    const { result } = at("/try");

    act(() =>
      result.current.open("/app/learn/real-analysis/lesson/1?lesson=abc"),
    );

    const { pathname, search, state } = result.current.location;
    expect(pathname).toBe("/app/learn/real-analysis/lesson/1");
    expect(search).toBe("");
    expect(state).toEqual({ backToChat: "/try", lessonId: "abc" });
  });

  it("goes back to the signed-in learner's own chat, whichever it was", () => {
    const { result } = at("/app/learn/ask/subject/maths?draft=x");

    act(() => result.current.open("/app/learn/maths/lesson/0"));

    expect(result.current.location.state).toEqual({
      backToChat: "/app/learn/ask/subject/maths?draft=x",
    });
  });

  it("has no chat to go back to from a lesson's own side chat", () => {
    const { result } = at("/app/learn/maths/lesson/2");

    act(() => result.current.open("/app/learn/maths/lesson/3"));

    expect(result.current.location.pathname).toBe("/app/learn/maths/lesson/3");
    expect(result.current.location.state).toEqual({});
  });

  it("takes the learner to their subjects, not to a page that is not there, when the plan has no such course", () => {
    const { result } = at("/try");

    act(() =>
      result.current.open("/app/learn/not-in-the-plan/lesson/0?lesson=abc"),
    );

    expect(result.current.location.pathname).toBe("/app/learn/subjects");
    expect(result.current.location.state).toEqual({ backToChat: "/try" });
  });

  it.each([
    "https://evil.example/app/learn/maths/lesson/0",
    "/app/you",
    "/app/learn/maths",
    "javascript:alert(1)",
  ])("stays in the chat for %s, which is not a lesson of the app's", (url) => {
    const { result } = at("/try");

    act(() => result.current.open(url));

    expect(result.current.location.pathname).toBe("/try");
  });
});
