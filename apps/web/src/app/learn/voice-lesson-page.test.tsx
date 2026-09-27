// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepRoute } from "@/lib/learner-route";
import type { UserProfile } from "@/lib/user-storage";
import { LearnerApp } from "@/test/learner-app";
import { learnerIn, loadedPlan, routeAnswer } from "@/test/learner";
import VoiceLessonPage from "./voice-lesson-page";

const { callAppTool, shown } = vi.hoisted(() => ({
  callAppTool: vi.fn(),
  shown: { profile: null as UserProfile | null },
}));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));
vi.mock("@/lib/use-user-profile", () => ({
  useUserProfile: () => shown.profile,
}));
// The lesson has not started: the page is its way back and the start button.
vi.mock("@/features/voice/hooks/use-voice-lesson", () => ({
  useVoiceLesson: () => ({
    state: { phase: { name: "idle" }, note: null },
    start: () => undefined,
  }),
}));

/** The way back from a lesson of a learner in the class, which the server routes so. */
function backLinkOf(level: string, voiceOnly: boolean): string | null {
  shown.profile = learnerIn(level);
  keepRoute(shown.profile, voiceOnly);
  callAppTool.mockResolvedValue(routeAnswer(voiceOnly));
  render(
    <LearnerApp plan={loadedPlan()} at="/app/learn/voice/lesson">
      <VoiceLessonPage />
    </LearnerApp>,
  );
  return screen.getByRole("link", { name: "voice.title" }).getAttribute("href");
}

beforeEach(() => {
  window.localStorage.clear();
  callAppTool.mockReset();
});

afterEach(cleanup);

describe("A voice lesson's way back", () => {
  it("is Home for a class that learns by voice alone, whose Home is its voice lessons", () => {
    expect(backLinkOf("nursery-1", true)).toBe("/app/learn");
  });

  it("is the voice lessons page for a class that also learns from slides", () => {
    expect(backLinkOf("primary-2", false)).toBe("/app/learn/voice");
  });
});
