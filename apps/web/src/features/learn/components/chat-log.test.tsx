// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import type { Turn } from "../lib/chat-turns";
import { PATH_UI } from "../lib/path-card";

vi.mock("../ui-apps/app-frame", () => ({
  AppFrame: ({ card }: { card: { resourceUri: string } }) => (
    <div data-testid="card">{card.resourceUri}</div>
  ),
}));
vi.mock("./chat-message", () => ({
  ChatMessageItem: ({ message }: { message: { content: string } }) => (
    <p>{message.content}</p>
  ),
}));
vi.mock("./tutor-activity", () => ({
  TutorActivity: ({ tool }: { tool: string | null }) => (
    <p role="status">{tool}</p>
  ),
}));

const { ChatLog } = await import("./chat-log");

let n = 0;
const message = (
  sender: "ai" | "user",
  content: string,
  resourceUri?: string,
): ChatMessage => ({
  id: `m${n++}`,
  threadId: "t",
  type: sender === "user" ? "user" : "system",
  content,
  timestamp: n,
  sender,
  ...(resourceUri
    ? {
        metadata: {
          card: {
            resourceUri,
            toolName: "x",
            toolInput: {},
            toolResult: { content: [] },
          },
        },
      }
    : {}),
});

function shown(
  messages: ChatMessage[],
  note?: string,
  welcoming = false,
  compact = false,
) {
  const turns: Turn[] = messages.length ? [{ id: "turn", messages }] : [];
  const scroll = {
    listRef: { current: null },
    contentRef: { current: null },
    atEnd: true,
    liveTurn: null,
    reserve: 0,
    jumpToEnd: vi.fn(),
  };
  render(
    <I18nContext.Provider
      value={
        {
          t: (key: string) => key,
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      <ChatLog
        scroll={scroll as never}
        ready
        turns={turns}
        welcome="Welcome"
        note={note}
        welcoming={welcoming}
        compact={compact}
        hostFor={() => ({ toolCalled: vi.fn(), message: () => false })}
        activity={undefined}
        changingPlan={false}
      />
    </I18nContext.Provider>,
  );
}

afterEach(cleanup);

describe("the path cards in the chat", () => {
  it("shows a card the learner asked to change as replaced by the new one, and only the new one live", () => {
    shown([
      message("user", "real analysis"),
      message("ai", "Here is a path.", PATH_UI),
      message("user", "black holes are missing"),
      message("ai", "Here is the new path.", PATH_UI),
    ]);

    expect(screen.getAllByTestId("card")).toHaveLength(1);
    expect(screen.getByText("chat.pathReplaced")).toBeTruthy();
  });

  it("keeps every card of other kinds, and a path the learner answered", () => {
    shown([
      message("ai", "A path.", PATH_UI),
      message("user", "Add to my plan:\nCourse: X\n- Y | Z"),
      message("ai", "A lesson.", "ui://graspy/start"),
      message("ai", "Another path.", PATH_UI),
    ]);

    expect(screen.getAllByTestId("card")).toHaveLength(3);
    expect(screen.queryByText("chat.pathReplaced")).toBeNull();
  });
});

describe("the quiet line under the welcome", () => {
  it("is there while nothing has been said", () => {
    shown([], "Your chats stay on this device until you sign in.");

    expect(
      screen.getByText("Your chats stay on this device until you sign in."),
    ).toBeTruthy();
  });

  it("goes once the conversation has begun", () => {
    shown([message("user", "hi")], "Your chats stay on this device.");

    expect(screen.queryByText("Your chats stay on this device.")).toBeNull();
  });

  it("is not there when there is none to say", () => {
    shown([]);

    expect(screen.getByText("Welcome").nextElementSibling).toBeNull();
  });
});

describe("the welcome of an empty chat", () => {
  it("is the heading of the screen, not a bubble", () => {
    shown([], undefined, true);

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeTruthy();
  });

  it("is outside the log, which announces replies", () => {
    shown([], "A note", true);

    const log = screen.getByRole("log");
    expect(log.contains(screen.getByRole("heading"))).toBe(false);
    expect(log.contains(screen.getByText("A note"))).toBe(false);
  });

  it("is a level 2 heading beside a lesson, which has its own level 1", () => {
    shown([], undefined, true, true);

    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("is no heading once there are messages", () => {
    shown([message("user", "hi")]);

    expect(screen.queryByRole("heading")).toBeNull();
  });
});
