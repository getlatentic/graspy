// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";

let messages: ChatMessage[] = [];
let busyThreadId: string | null = null;
let threadsLoaded = true;
let threadId: string | null = "thread-1";
let ready = true;
let curriculum: { planId: string; subjects: unknown[] } | null = null;
const send = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock("../learner-context", () => ({
  usePlan: () => ({ curriculum, isGenerating: false, nextSubject: null }),
  useChat: () => ({
    busyThreadId,
    threadsLoaded,
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
    threadId,
    conversation: messages,
    ready,
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

function chat(
  scope: ThreadScope,
  firstSeed: { text: string; id: string } | null = null,
) {
  let seed = firstSeed;
  const view = () => (
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <ChatView
        scope={scope}
        seed={seed}
        header={(welcoming) => (
          <p data-testid="bar">{welcoming ? "welcoming" : "talking"}</p>
        )}
      />
    </I18nContext.Provider>
  );
  const result = render(view());
  return {
    again: (next = seed) => {
      seed = next;
      result.rerender(view());
    },
  };
}

beforeEach(() => {
  messages = [];
  threadsLoaded = true;
  threadId = "thread-1";
  ready = true;
  busyThreadId = null;
  curriculum = { planId: "plan-1", subjects: [{}] };
  send.mockReset();
  send.mockImplementation(() => Promise.resolve());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("CSS", { escape: (value: string) => value });
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
    expect(screen.getByRole("log").contains(title)).toBe(false);
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

  it("leaves the welcome of a turn this view did not send", () => {
    busyThreadId = "thread-1";

    chat(GENERAL);

    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("a chat that may have saved messages", () => {
  it("shows no welcome, composer-in-the-middle or chips before the device's chats are read", () => {
    threadsLoaded = false;
    threadId = null;

    chat(GENERAL);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByLabelText(t("chat.suggestedQuestions"))).toBeNull();
    expect(screen.getByRole("textbox").closest(".border-t")).not.toBeNull();
    expect(screen.getByTestId("bar").textContent).toBe("talking");
  });

  it("shows the conversation, never the welcome, when its thread is found with messages", () => {
    threadsLoaded = false;
    threadId = null;
    const { again } = chat(GENERAL);

    threadsLoaded = true;
    threadId = "thread-1";
    ready = false;
    again();
    expect(screen.queryByRole("heading")).toBeNull();

    ready = true;
    messages = [message("user", "earlier")];
    again();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("earlier")).toBeTruthy();
  });
});

describe("the first question", () => {
  it("goes from the welcome straight to the conversation, with no blank frame between", async () => {
    let finish = () => {};
    send.mockImplementation(() => new Promise<void>((done) => (finish = done)));
    threadId = null;
    const { again } = chat(GENERAL);
    const composer = screen.getByRole("textbox");
    await userEvent.type(composer, "hello{Enter}");
    expect(send).toHaveBeenCalledOnce();

    // The thread is made but its messages are not read yet: still the welcome, no chips.
    threadId = "thread-2";
    ready = false;
    again();
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByLabelText(t("chat.suggestedQuestions"))).toBeNull();
    expect(screen.queryByText(t("ask.anythingWelcome"), { selector: "p" })).toBeNull();

    // The question lands: the conversation, with the question and no welcome bubble.
    messages = [message("user", "hello")];
    again();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.queryByText(t("ask.anythingWelcome"))).toBeNull();
    expect(screen.getByRole("textbox")).toBe(composer);
    finish();
  });
});

describe("a chip", () => {
  it("does nothing while a turn runs elsewhere", async () => {
    busyThreadId = "another-thread";
    chat(GENERAL);

    const chip = screen.getByRole("button", { name: t("home.planTitle") });
    expect((chip as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(chip);

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("gives way to a newer seed from the route", async () => {
    const { again } = chat(GENERAL);
    await userEvent.click(
      screen.getByRole("button", { name: t("home.planTitle") }),
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      t("home.planDraft"),
    );

    again({ text: "from the route", id: "route-2" });

    expect(await screen.findByDisplayValue("from the route")).toBeTruthy();
  });
});

describe("a chip and the words already written", () => {
  it("is out of reach while there is a draft, and back when it is cleared", async () => {
    chat(GENERAL);
    const composer = screen.getByRole("textbox");
    const chips = screen.getByRole("group", {
      name: t("chat.suggestedQuestions"),
    });

    await userEvent.type(composer, "half a thought");
    expect(chips.classList.contains("invisible")).toBe(true);
    expect((composer as HTMLTextAreaElement).value).toBe("half a thought");

    await userEvent.clear(composer);
    expect(chips.classList.contains("invisible")).toBe(false);
  });
});
