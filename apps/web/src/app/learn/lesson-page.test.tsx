// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";

const mocks = vi.hoisted(() => ({
  useLessonCard: vi.fn(),
  topic: {
    slug: "real-analysis",
    subject: { name: "Real analysis", slug: "real-analysis" },
    subjectName: "Real analysis",
    target: { topic: "Sequences" },
    next: null,
  },
}));
vi.mock("@/features/learn/hooks/use-lesson-topic", () => ({
  useLessonTopic: () => mocks.topic,
}));
vi.mock("@/features/learn/hooks/use-lesson-card", () => ({
  useLessonCard: mocks.useLessonCard,
}));
vi.mock("@/features/learn/learner-context", () => ({
  usePlan: () => ({ isLoaded: true }),
  useProgress: () => ({}),
}));
vi.mock("@/features/learn/ui-apps/app-frame", () => ({ AppFrame: () => null }));

const { default: LessonPage } = await import("./lesson-page");

function Where() {
  const { pathname, state } = useLocation();
  return <p data-testid="where">{`${pathname} ${JSON.stringify(state)}`}</p>;
}

function open(state?: unknown) {
  mocks.useLessonCard.mockReturnValue({
    key: "k",
    card: null,
    failure: null,
    retry: vi.fn(),
  });
  render(
    <I18nContext.Provider
      value={
        {
          t: (key: string, values?: Record<string, string>) =>
            values?.subject ? `${key} ${values.subject}` : key,
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      <MemoryRouter
        initialEntries={[
          { pathname: "/app/learn/real-analysis/lesson/1", state },
        ]}
      >
        <Routes>
          <Route
            path="/app/learn/:subject/lesson/:topicIndex"
            element={<LessonPage />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </I18nContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  mocks.useLessonCard.mockReset();
});

describe("a lesson opened from a card in the chat", () => {
  it("has a clear way back to the same chat, beside the way back to the subject", async () => {
    open({ backToChat: "/try", lessonId: "lesson-9" });

    expect(
      screen.getByRole("button", { name: "lesson.backTo Real analysis" }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "lesson.backToChat" }),
    );

    expect(screen.getByTestId("where").textContent).toMatch(/^\/try /);
  });

  it("opens the lesson the chat made", () => {
    open({ backToChat: "/try", lessonId: "lesson-9" });

    expect(mocks.useLessonCard).toHaveBeenCalledWith(
      mocks.topic.target,
      "lesson-9",
    );
  });

  it("has no way back to a chat for a lesson opened any other way", () => {
    open();

    expect(
      screen.queryByRole("button", { name: "lesson.backToChat" }),
    ).toBeNull();
    expect(mocks.useLessonCard).toHaveBeenCalledWith(
      mocks.topic.target,
      undefined,
    );
  });

  it("does not go to a place outside the app", () => {
    open({ backToChat: "https://evil.example" });

    expect(
      screen.queryByRole("button", { name: "lesson.backToChat" }),
    ).toBeNull();
  });
});
