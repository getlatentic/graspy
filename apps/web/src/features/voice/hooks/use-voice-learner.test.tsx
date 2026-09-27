// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/user-storage";
import { LearnerApp } from "@/test/learner-app";
import { learnerIn, loadedPlan, routeAnswer } from "@/test/learner";
import { useVoiceOnly } from "./use-voice-learner";

const { callAppTool, shown } = vi.hoisted(() => ({
  callAppTool: vi.fn(),
  shown: { profile: null as UserProfile | null },
}));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));
vi.mock("@/lib/use-user-profile", () => ({
  useUserProfile: () => shown.profile,
}));

const offline = new TypeError("Failed to fetch");
const plan = loadedPlan();
const wrapper = ({ children }: { children: ReactNode }) => (
  <LearnerApp plan={plan}>{children}</LearnerApp>
);

beforeEach(() => {
  window.localStorage.clear();
  callAppTool.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(cleanup);

describe("useVoiceOnly", () => {
  it("asks the server again after learner_route fails, and follows the answer that comes", async () => {
    shown.profile = learnerIn("nursery-1");
    callAppTool
      .mockRejectedValueOnce(offline)
      .mockResolvedValue(routeAnswer(true));
    const listening = vi.spyOn(window, "addEventListener");

    const { result } = renderHook(useVoiceOnly, { wrapper });

    await waitFor(() =>
      expect(listening).toHaveBeenCalledWith("online", expect.any(Function)),
    );
    expect(result.current).toBeNull();
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(result.current).toBe(true));
    expect(callAppTool).toHaveBeenCalledTimes(2);
  });

  it("stops asking once the page that asked is gone", async () => {
    shown.profile = learnerIn("nursery-2");
    callAppTool.mockRejectedValue(offline);
    const listening = vi.spyOn(window, "addEventListener");

    const { unmount } = renderHook(useVoiceOnly, { wrapper });
    await waitFor(() =>
      expect(listening).toHaveBeenCalledWith("online", expect.any(Function)),
    );
    unmount();
    window.dispatchEvent(new Event("online"));
    await new Promise((done) => setTimeout(done, 0));

    expect(callAppTool).toHaveBeenCalledTimes(1);
  });
});
