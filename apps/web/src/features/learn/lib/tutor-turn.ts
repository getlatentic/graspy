import {
  askAgent,
  TurnStopped,
  type LearnerContext,
  type TutorReply,
} from "@/lib/a2a/client";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { ApiError } from "@/lib/api/errors";
import {
  saveChatMessage,
  type ChatMessage,
  type ChatMessageMetadata,
  type ChatThread,
  type NewChatMessage,
  type ThreadScope,
} from "@/lib/chat-db";
import type { MessageStore } from "./message-store";
import type { Translate } from "@/lib/i18n-context";

type Store = Pick<
  MessageStore,
  "addMessage" | "updateMessage" | "replaceMessage" | "messagesOf"
>;

interface TurnRequest {
  text: string;
  scope: ThreadScope;
  t: Translate;
  calls?: AppCallRequest[];
}

export interface TurnDeps {
  store: Store;
  ensureThread: (scope: ThreadScope) => Promise<ChatThread>;
  recordTurn: (
    threadId: string,
    turn: { agentContextId?: string; question: string },
  ) => Promise<void>;
  /** The conversation's context, not the page's. */
  learnerFor: (scope: ThreadScope) => Promise<LearnerContext>;
  carryOut: (action: TutorAction, thread: ChatThread) => Promise<void>;
  ask?: typeof askAgent;
  save?: typeof saveChatMessage;
}

interface TurnEvents {
  signal: AbortSignal;
  onThread: (threadId: string) => void;
  onActivity: (tool: string | null) => void;
}

export async function runTurn(
  request: TurnRequest,
  deps: TurnDeps,
  events: TurnEvents,
): Promise<void> {
  let shown: StreamingMessage | null = null;
  try {
    const thread = await deps.ensureThread(request.scope);
    events.onThread(thread.id);
    shown = new StreamingMessage(deps.store, thread.id, deps.save);
    const unanswered = unansweredIn(deps.store.messagesOf(thread.id));
    await deps.store.addMessage(questionOf(thread.id, request));
    const reply = await askTutor(
      { ...request, unanswered },
      thread,
      deps,
      events,
      shown,
    );
    await deps.recordTurn(thread.id, {
      agentContextId: reply.contextId,
      question: request.text,
    });
    const [card] = reply.cards;
    await shown.finish(reply.text, {
      followUps: reply.followUps,
      ...(card ? { card } : {}),
    });
    for (const action of reply.actions) await deps.carryOut(action, thread);
  } catch (error) {
    await failed(error, shown, deps.store, request.t);
  } finally {
    shown?.dispose();
  }
}

/** Questions whose turns failed, so the tutor never read them. */
function unansweredIn(messages: readonly ChatMessage[]): string[] {
  const answered = messages.findLastIndex(
    (message) => message.sender === "ai" && message.type !== "error",
  );
  return messages
    .slice(answered + 1)
    .filter((message) => message.sender === "user")
    .map((message) => message.content);
}

function questionOf(threadId: string, request: TurnRequest): NewChatMessage {
  return {
    threadId,
    type: "user",
    content: request.text,
    sender: "user",
    ...(request.calls?.length ? { metadata: { appCalls: request.calls } } : {}),
  };
}

async function askTutor(
  request: TurnRequest & { unanswered: string[] },
  thread: ChatThread,
  deps: TurnDeps,
  events: TurnEvents,
  shown: StreamingMessage,
): Promise<TutorReply> {
  const ask = deps.ask ?? askAgent;
  return ask(
    {
      text: request.text,
      contextId: thread.agentContextId,
      learner: await deps.learnerFor(request.scope),
      appCalls: request.calls,
      unanswered: request.unanswered,
    },
    {
      signal: events.signal,
      onActivity: events.onActivity,
      onDelta: (delta) => {
        events.onActivity(null);
        shown.append(delta);
      },
      onRestart: () => shown.restart(),
    },
  );
}

async function failed(
  error: unknown,
  shown: StreamingMessage | null,
  store: Store,
  t: Translate,
): Promise<void> {
  if (error instanceof TurnStopped) {
    await shown?.finish(null, { stopped: true });
    return;
  }
  console.error("Tutor response failed:", error);
  await shown?.finish(null, {});
  if (!shown) return;
  await store.addMessage(
    {
      threadId: shown.threadId,
      type: "error",
      content: failureText(error, t),
      sender: "ai",
    },
    // Not persisted, or failures would stack up in the learner's history.
    { persist: false },
  );
}

function failureText(error: unknown, t: Translate): string {
  return error instanceof ApiError && error.retryable
    ? t("chat.temporaryProblem")
    : t("chat.tutorError");
}

/** Updated at most once a frame. */
class StreamingMessage {
  readonly threadId: string;
  private readonly store: Store;
  private readonly save: typeof saveChatMessage;
  private text = "";
  private created: Promise<ChatMessage> | null = null;
  private frame: number | null = null;

  constructor(store: Store, threadId: string, save = saveChatMessage) {
    this.store = store;
    this.threadId = threadId;
    this.save = save;
  }

  append(delta: string) {
    this.text += delta;
    this.created ??= this.store.addMessage(
      {
        threadId: this.threadId,
        type: "system",
        content: this.text,
        sender: "ai",
        metadata: { streaming: true },
      },
      { persist: false },
    );
    this.frame ??= requestAnimationFrame(this.flush);
  }

  restart() {
    this.text = "";
    this.frame ??= requestAnimationFrame(this.flush);
  }

  /** Null `answer` keeps what streamed. */
  async finish(answer: string | null, metadata: ChatMessageMetadata) {
    this.dispose();
    const kept = (answer ?? this.text).trim();
    if (!kept) return;
    const message: NewChatMessage = {
      threadId: this.threadId,
      type: "system",
      content: kept,
      sender: "ai",
      metadata,
    };
    if (!this.created) {
      await this.store.addMessage(message);
      return;
    }
    const temporary = await this.created;
    this.store.replaceMessage(temporary.id, await this.save(message));
  }

  dispose() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private flush = () => {
    this.frame = null;
    void this.created?.then((message) =>
      this.store.updateMessage(message.id, { content: this.text }),
    );
  };
}
