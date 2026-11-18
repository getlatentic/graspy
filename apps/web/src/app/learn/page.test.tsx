// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepRoute } from "@/lib/learner-route";
import type { UserProfile } from "@/lib/user-storage";
import { LearnerApp } from "@/test/learner-app";
import { learnerIn, loadedPlan, routeAnswer } from "@/test/learner";
import { setAccount } from "@/lib/account/account-store";
import { signedInAs } from "@/test/account-session";
import HomePage from "./page";

const { callAppTool, shown } = vi.hoisted(() => ({
  callAppTool: vi.fn(),
  shown: { profile: null as UserProfile | null },
}));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));
vi.mock("@/lib/use-user-profile", () => ({
  useUserProfile: () => shown.profile,
}));
// The catalogue is still coming: Home is the voice lessons page while it loads.
vi.mock("@/lib/voice/voice-api", async (actual) => ({
  ...(await actual<typeof import("@/lib/voice/voice-api")>()),
  catalogue: () => new Promise(() => undefined),
}));

/** Home for a learner in the class, which the server has learn by voice alone. */
function homeOfVoiceOnly(level: string) {
  shown.profile = learnerIn(level);
  keepRoute(shown.profile, true);
  callAppTool.mockResolvedValue(routeAnswer(true));
  render(
    <LearnerApp plan={loadedPlan()}>
      <HomePage />
    </LearnerApp>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  callAppTool.mockReset();
});

afterEach(cleanup);

describe("Home of a class that learns by voice alone", () => {
  it("is the class's voice lessons", () => {
    homeOfVoiceOnly("nursery-1");

    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toBe("voice.title");
  });

  it("says the app has no voice lessons for a class it does not know, and leads to the details", () => {
    homeOfVoiceOnly("nursery-3");

    expect(screen.getByText("voice.noLessons")).toBeTruthy();
    const change = screen.getByRole("link", { name: "you.change" });
    expect(change.getAttribute("href")).toBe("/app/learn/you/details");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("Home while the plan is made", () => {
  const building = () => {
    shown.profile = { ...learnerIn("jss-1"), gradeLevel: "JSS 1" };
    callAppTool.mockResolvedValue(routeAnswer(false));
    return render(
      <LearnerApp plan={{ ...loadedPlan(), isGenerating: true }}>
        <HomePage />
      </LearnerApp>,
    );
  };

  afterEach(() => setAccount(null));

  it("welcomes the learner and puts the plan's progress under a title of its own", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    building();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "planBuilding.welcome",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "planBuilding.making" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("is not Home's usual sections yet", () => {
    building();
    expect(screen.queryByText("home.subjectsTitle")).toBeNull();
  });
});
