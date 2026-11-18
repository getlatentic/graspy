// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
    expect(title.textContent).toBe("Aunty Chioma");
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
    return render(
      <LearnerApp plan={{ ...loadedPlan(), isGenerating: true }}>
        <HomePage />
      </LearnerApp>,
    );
  };

  afterEach(() => setAccount(null));

  it("is a welcome, then the plan's progress under a heading of its own", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    building();

    const welcome = screen.getByRole("heading", { level: 1 });
    const progress = screen.getByRole("heading", {
      level: 2,
      name: "planBuilding.making",
    });
    expect(
      welcome.compareDocumentPosition(progress) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const section = progress.closest("section")!;
    expect(within(section).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(section.contains(welcome)).toBe(false);
  });

  it("has none of Home's usual sections yet", () => {
    building();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryByText("home.continueTitle")).toBeNull();
    expect(screen.queryByText("home.subjectsTitle")).toBeNull();
  });
});
