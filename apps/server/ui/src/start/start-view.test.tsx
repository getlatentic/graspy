// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contract from "@/lib/card-contract.json";

type Created = {
  ontoolresult?: (params: unknown) => void;
  onhostcontextchanged?: (changed: object) => void;
  getHostContext: () => object;
  callServerTool: ReturnType<typeof vi.fn>;
  openLink: ReturnType<typeof vi.fn>;
};
const app: Created = {
  getHostContext: () => ({ theme: "light", locale: "en" }),
  callServerTool: vi.fn(),
  openLink: vi.fn(),
};
vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: ({ onAppCreated }: { onAppCreated: (created: Created) => void }) => {
    onAppCreated(app);
    return { app, error: null };
  },
}));

const { StartView } = await import("./start-view");
const { openUrl } = await import("./use-start");

const START = contract.content["ui://graspy/start"];
const WATCH_MS = 2500;
const WATCH_LIMIT_MS = 5 * 60 * 1000;

const card = (content: object) => ({
  content: [{ type: "text", text: "A button to open the lesson" }],
  structuredContent: content,
  _meta: { viewUUID: "d".repeat(32) },
});

const lesson = (status: string, extra: object = {}) => ({
  isError: false,
  structuredContent: { status, attempt: 0, lessonId: null, ...extra },
});

async function open(content: object) {
  render(<StartView />);
  await act(async () => app.ontoolresult?.(card(content)));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  app.callServerTool = vi.fn();
  app.openLink = vi.fn().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the card that opens a lesson", () => {
  it("shows nothing for a result that is not a lesson of the app's own", async () => {
    await open({ ...START, openPath: "https://evil.example/" });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens a lesson that is made only when the learner presses the button", async () => {
    await open({ ...START, status: "ready", lessonId: "lesson-9" });

    expect(app.openLink).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`Open ${START.topic}`) }),
      );
    });

    expect(app.openLink).toHaveBeenCalledOnce();
    expect(app.openLink).toHaveBeenCalledWith({
      url: `${START.openPath}?lesson=lesson-9`,
    });
    expect(app.callServerTool).not.toHaveBeenCalled();
  });

  it("watches a lesson still being made and offers the button once it is made", async () => {
    app.callServerTool
      .mockResolvedValueOnce(lesson("making"))
      .mockResolvedValueOnce(lesson("ready", { lessonId: "lesson-4" }));
    await open({ ...START, status: "making", lessonId: null });

    expect(screen.getByRole("status").textContent).toBe("Making your lesson");
    await act(() => vi.advanceTimersByTimeAsync(WATCH_MS));
    expect(screen.queryByRole("button")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_MS));

    expect(app.callServerTool).toHaveBeenCalledWith({
      name: "lesson_progress",
      arguments: { target: START.target },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`Open ${START.topic}`) }),
      );
    });
    expect(app.openLink).toHaveBeenCalledWith({
      url: `${START.openPath}?lesson=lesson-4`,
    });
  });

  it("says plainly that the lesson failed and asks for it again with the next attempt", async () => {
    app.callServerTool
      .mockResolvedValueOnce(lesson("making", { attempt: 1 }))
      .mockResolvedValueOnce(lesson("ready", { attempt: 1, lessonId: "l-2" }));
    await open({ ...START, status: "failed", lessonId: null });

    expect(screen.getByRole("alert").textContent).toBe(
      "The lesson could not be made.",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(app.callServerTool).toHaveBeenNthCalledWith(1, {
      name: "give_lesson",
      arguments: { target: START.target, attempt: 1 },
    });
    expect(screen.getByRole("status")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_MS));
    expect(
      screen.getByRole("button", { name: new RegExp(`Open ${START.topic}`) }),
    ).toBeTruthy();
  });

  it("goes back to failed, with its button, when asking again reaches nothing", async () => {
    app.callServerTool.mockRejectedValue(new Error("offline"));
    await open({ ...START, status: "failed", lessonId: null });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("looks again after a look that found nothing", async () => {
    app.callServerTool
      .mockResolvedValueOnce({ isError: true })
      .mockResolvedValueOnce(lesson("ready", { lessonId: "l-3" }));
    await open({ ...START, status: "making", lessonId: null });

    await act(() => vi.advanceTimersByTimeAsync(WATCH_MS));
    await act(() => vi.advanceTimersByTimeAsync(WATCH_MS));

    expect(app.callServerTool).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: new RegExp(`Open ${START.topic}`) }),
    ).toBeTruthy();
  });
});

describe("a lesson that is never made", () => {
  const KEY = `graspy.start.${"d".repeat(32)}`;

  it("is watched for a few minutes at most, then said to have failed with its button to try again", async () => {
    app.callServerTool.mockResolvedValue(lesson("making"));
    await open({ ...START, status: "making", lessonId: null });

    await act(() => vi.advanceTimersByTimeAsync(WATCH_LIMIT_MS + 3 * WATCH_MS));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    const looked = app.callServerTool.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10 * WATCH_MS));
    expect(app.callServerTool).toHaveBeenCalledTimes(looked);
  });

  it("is not watched at all when its card is opened again long after", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ since: Date.now() - WATCH_LIMIT_MS - 1000 }),
    );

    await open({ ...START, status: "making", lessonId: null });
    await act(() => vi.advanceTimersByTimeAsync(5 * WATCH_MS));

    expect(app.callServerTool).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("where a lesson is opened", () => {
  it("names the lesson made, so opening it does not make another", () => {
    const start = START as Parameters<typeof openUrl>[0];

    expect(openUrl(start, "a b")).toBe(`${start.openPath}?lesson=a%20b`);
    expect(openUrl(start, null)).toBe(start.openPath);
  });
});
