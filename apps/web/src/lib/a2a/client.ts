import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  createAuthenticatingFetchWithRetry,
} from "@a2a-js/sdk/client";
import type { AuthenticationHandler, Client } from "@a2a-js/sdk/client";
import { A2A_BASE_URL } from "@/lib/env";
import { ApiError, toNetworkError } from "@/lib/api/errors";
import { getSessionToken, refreshSessionToken } from "@/lib/api/session";
import {
  activityOf,
  agentData,
  agentText,
  NO_DATA,
  ROLE_AGENT,
  type ReplyData,
} from "./reply-data";
import { messageParts, type AppCallRequest } from "./request-data";

// The wire format is protobuf-derived (numeric roles, `{content: {$case, value}}`
// parts); this folder is the only place that shape is known.
const ROLE_USER = 1;
const STATE_COMPLETED = 3;

// The agent card lives at the origin root and carries the RPC URL itself.
const DISCOVERY_ORIGIN = new URL(A2A_BASE_URL).origin;

// An expired session token is re-minted inside the transport, not surfaced as a failed turn.
const authentication: AuthenticationHandler = {
  headers: async () => ({ Authorization: `Bearer ${await getSessionToken()}` }),
  shouldRetryWithHeaders: async (_request, response) =>
    response.status === 401
      ? { Authorization: `Bearer ${await refreshSessionToken()}` }
      : undefined,
};

const authenticatingFetch = createAuthenticatingFetchWithRetry(
  fetch,
  authentication,
);

const factoryOptions = ClientFactoryOptions.createFrom(
  ClientFactoryOptions.default,
  {
    transports: [
      new JsonRpcTransportFactory({ fetchImpl: authenticatingFetch }),
    ],
    cardResolver: new DefaultAgentCardResolver({
      fetchImpl: authenticatingFetch,
    }),
  },
);

let client: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  client ??= new ClientFactory(factoryOptions)
    .createFromUrl(DISCOVERY_ORIGIN)
    .catch((cause) => {
      client = null;
      throw toNetworkError(cause);
    });
  return client;
}

/** Sent as message metadata so the message text stays the learner's own words. */
export interface LearnerContext {
  country?: string;
  language?: string;
  gradeLevel?: string;
  subject?: string;
  subjectSlug?: string;
  topic?: string;
  topics?: string[];
  subjects?: { name: string; slug: string }[];
  planId?: string;
}

export interface TutorReply extends ReplyData {
  text: string;
  contextId?: string;
}

export interface TurnListener {
  onDelta?: (text: string) => void;
  /** What streamed is withdrawn: the tutor is writing the answer again. */
  onRestart?: () => void;
  onActivity?: (tool: string) => void;
  /** Aborting makes askAgent reject with TurnStopped. */
  signal?: AbortSignal;
}

export class TurnStopped extends Error {
  constructor() {
    super("The learner stopped the tutor");
    this.name = "TurnStopped";
  }
}

export interface TutorTurn {
  text: string;
  contextId?: string;
  learner?: LearnerContext;
  appCalls?: AppCallRequest[];
  /** The learner's earlier messages whose turns failed, oldest first. */
  unanswered?: string[];
}

/** The stream is a preview; the resolved reply's text replaces what streamed. */
export async function askAgent(
  turn: TutorTurn,
  listener: TurnListener = {},
): Promise<TutorReply> {
  let heard = false;
  const heeded: TurnListener = {
    ...listener,
    onDelta: (delta) => {
      heard = true;
      listener.onDelta?.(delta);
    },
  };
  try {
    return await askOnce(turn, heeded);
  } catch (error) {
    // One silent retry for a gateway blip, unless words already showed: a rerun would repeat them.
    if (!(error instanceof ApiError) || !error.retryable || heard) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return askOnce(turn, heeded);
  }
}

interface Heard {
  answer: string;
  data: ReplyData;
  thread: string | undefined;
  finished: boolean;
  streamed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventValue = any;

function keepSaid(heard: Heard, message: EventValue) {
  const said = agentText(message);
  if (!said.trim()) return;
  heard.answer = said;
  heard.data = agentData(message);
}

type OnEvent = (
  value: EventValue,
  heard: Heard,
  listener: TurnListener,
) => void;

const ON_EVENT = new Map<string, OnEvent>(
  Object.entries({
    task: (value, heard) => {
      heard.thread = value?.contextId ?? heard.thread;
    },
    artifactUpdate: (value, heard, listener) => {
      const piece = agentText({
        role: ROLE_AGENT,
        parts: value?.artifact?.parts,
      });
      // A2A replaces an artifact sent without append, withdrawing what showed.
      if (value?.append === false && heard.streamed) listener.onRestart?.();
      if (!piece) return;
      heard.streamed = true;
      listener.onDelta?.(piece);
    },
    statusUpdate: (value, heard, listener) => {
      const status = value?.status;
      if (status?.state === STATE_COMPLETED) heard.finished = true;
      const tool = activityOf(status?.message);
      if (tool) listener.onActivity?.(tool);
      keepSaid(heard, status?.message);
    },
    message: (value, heard) => keepSaid(heard, value),
  } satisfies Record<string, OnEvent>),
);

function requestOf({
  text,
  contextId,
  learner,
  appCalls,
  unanswered,
}: TutorTurn) {
  return {
    message: {
      messageId: crypto.randomUUID(),
      role: ROLE_USER,
      parts: messageParts(text, { calls: appCalls, unanswered }),
      ...(contextId ? { contextId } : {}),
      ...(learner ? { metadata: { learner } } : {}),
    },
  };
}

async function askOnce(
  turn: TutorTurn,
  listener: TurnListener,
): Promise<TutorReply> {
  const agent = await getClient();
  const heard: Heard = {
    answer: "",
    data: NO_DATA,
    thread: turn.contextId,
    finished: false,
    streamed: false,
  };

  try {
    for await (const event of agent.sendMessageStream(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requestOf(turn) as any,
      { signal: listener.signal },
    )) {
      const payload = (
        event as { payload?: { $case: string; value: EventValue } }
      ).payload;
      if (payload)
        ON_EVENT.get(payload.$case)?.(payload.value, heard, listener);
    }
  } catch (cause) {
    if (listener.signal?.aborted) throw new TurnStopped();
    throw toNetworkError(cause);
  }

  if (!heard.answer.trim() && !heard.finished) {
    throw new ApiError("The tutor stopped before answering", 0);
  }
  return { text: heard.answer.trim(), contextId: heard.thread, ...heard.data };
}
