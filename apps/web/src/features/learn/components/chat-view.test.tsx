// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";

let messages: ChatMessage[] = [];
let busyThreadId: string | null = null;
let curriculum: { planId: string; subjects: unknown[] } | null = null;
const send = vi.fn();

vi.mock("../learner-context", () => ({
  usePlan: () => ({ curriculum, isGenerating: false, nextSubject: null }),
  useChat: () => ({
    busyThreadId,
    planChangeThreadId: null,
    pendingPlanChange: null,
    isChangingPlan: false,
    reconnecting: false,
    tutorActivity: null,
    keepViewCalls: vi.fn(),
    send,
    stopTutor: vi.fn(),
    confirmPlanChange: vi.fn(),
    dismissPlanChange: vi.fn(),
  }),
}));
vi.mock("@/features/learn/hooks/use-conversation", () => ({
  useConversation: () => ({
    threadId: "thread-1",
    conversation: messages,
    ready: true,
  }),
}));
vi.mock("@/features/learn/lib/current-topic", () => ({
  currentTopic: () => null,
}));
vi.mock("@/features/learn/hooks/use-app-host", () => ({
  useAppHost: () => () => ({ toolCalled: vi.fn(), message: () => false }),
}));
vi.mock("@/features/learn/hooks/use-open-lesson", () => ({
  useOpenLesson: () => vi.fn(),
}));
vi.mock("@/features/learn/components/visitor-check", () => ({
  VisitorCheck: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/learn/components/chat-message", () => ({
  ChatMessageItem: ({ message }: { message: ChatMessage }) => (
    <p>{message.content}</p>
  ),
}));
vi.mock("@/features/learn/ui-apps/app-frame", () => ({ AppFrame: () => null }));

const { ChatView } = await import("./chat-view");

const t = (key: string, values?: Record<string, string>) => {
  const text = key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? "");
};

const GENERAL: ThreadScope = { kind: "general", planId: "plan-1" };
const TOPIC: ThreadScope = {
  kind: "topic",
  planId: "plan-1",
  subjectSlug: "mathematics",
  topic: "Fractions",
};

const message = (sender: "ai" | "user", content: string): ChatMessage => ({
  id: `m-${content}`,
  threadId: "thread-1",
  type: sender === "user" ? "user" : "complete",
  content,
  timestamp: 1,
  sender,
});

function chat(scope: ThreadScope) {
  const view = () => (
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <ChatView
        scope={scope}
        header={(welcoming) => (
          <p data-testid="bar">{welcoming ? "welcoming" : "talking"}</p>
        )}
      />
    </I18nContext.Provider>
  );
  const result = render(view());
  return { again: () => result.rerender(view()) };
}

beforeEach(() => {
  messages = [];
  busyThreadId = null;
  curriculum = { planId: "plan-1", subjects: [{}] };
  send.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the empty chat", () => {
  it("is the welcome as the title, the composer and the chips in one middle group", () => {
    chat(GENERAL);

    const title = screen.getByRole("heading", { name: t("ask.anythingWelcome") });
    const composer = screen.getByRole("textbox");
    const chips = screen.getByLabelText(t("chat.suggestedQuestions"));
    expect(within(chips).getAllByRole("button")).toHaveLength(2);
    // The foot's border is the mark of the composer pinned there.
    expect(composer.closest(".border-t")).toBeNull();
    expect(title.compareDocumentPosition(composer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(composer.compareDocumentPosition(chips)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("tells the bar the welcome is showing", () => {
    chat(GENERAL);

    expect(screen.getByTestId("bar").textContent).toBe("welcoming");
  });

  it("gives a topic its own welcome and questions, which send as they are", async () => {
    chat(TOPIC);

    expect(
      screen.getByRole("heading", { name: t("chat.aiTutorWelcome") }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: t("chat.quickActionExplain") }),
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toContain("Fractions");
  });

  it("puts a general chip's words in the composer instead of sending them", async () => {
    chat(GENERAL);

    await userEvent.click(
      screen.getByRole("button", { name: t("home.planTitle") }),
    );

    expect(send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      t("home.planDraft"),
    );
  });

  it("asks a new learner what they would like to learn, with no chips", () => {
    curriculum = { planId: "plan-1", subjects: [] };

    chat(GENERAL);

    expect(
      screen.getByRole("heading", { name: t("chat.startWelcome") }),
    ).toBeTruthy();
    expect(screen.queryByLabelText(t("chat.suggestedQuestions"))).toBeNull();
  });
});

describe("the conversation", () => {
  it("has no heading, chips or middle group once a message exists, and the composer is at the foot", () => {
    messages = [message("user", "hello")];

    chat(GENERAL);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByLabelText(t("chat.suggestedQuestions"))).toBeNull();
    expect(screen.getByRole("textbox").closest(".border-t")).not.toBeNull();
    expect(screen.getByTestId("bar").textContent).toBe("talking");
  });

  it("keeps the same composer, with its draft, when the first message arrives", async () => {
    const { again } = chat(GENERAL);
    const composer = screen.getByRole("textbox");
    await userEvent.type(composer, "half a thought");
    composer.focus();

    messages = [message("user", "hello")];
    again();

    const after = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(after).toBe(composer);
    expect(after.value).toBe("half a thought");
    expect(document.activeElement).toBe(composer);
    expect(after.closest(".border-t")).not.toBeNull();
  });

  it("leaves the welcome as soon as a turn is being answered", () => {
    busyThreadId = "thread-1";

    chat(GENERAL);

    expect(screen.queryByRole("heading")).toBeNull();
  });
});
