// Everything here arrives from the network, so each field is checked before it is trusted.
// The server exports its shape to reply-contract.json, which the tests hold this file to.
import type { CallToolResult } from "@modelcontextprotocol/client";

export const ROLE_AGENT = 2;

/** Each has its own chat.activity message in every locale. */
export const TUTOR_TOOLS = [
  "calculate",
  "open_subject",
  "open_topic",
  "add_topic",
  "propose_path",
  "change_subjects",
  "rebuild_plan",
  "give_practice",
  "give_passage",
] as const;

interface Part {
  content?: { $case: string; value: unknown };
}

interface AgentMessage {
  role?: number;
  parts?: Part[];
}

interface OpenTopicAction {
  type: "open_topic";
  subjectSlug: string;
  topicIndex: number;
  topic: string;
}

interface AddTopicAction {
  type: "add_topic";
  subjectSlug: string;
  subject: string;
  topic: string;
}

interface ChangeSubjectsAction {
  type: "change_subjects";
  add: string[];
  remove: string[];
}

interface RebuildPlanAction {
  type: "rebuild_plan";
}

interface OpenSubjectAction {
  type: "open_subject";
  subjectSlug: string;
  subject: string;
}

interface ProposePathAction {
  type: "propose_path";
  goal: string;
}

/** A tool result shown as an MCP Apps view; the app hosts it without reading it. */
export interface TutorCard {
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: CallToolResult;
}

export type TutorAction =
  | OpenTopicAction
  | OpenSubjectAction
  | AddTopicAction
  | ChangeSubjectsAction
  | RebuildPlanAction
  | ProposePathAction;

export interface ReplyData {
  followUps: string[];
  actions: TutorAction[];
  cards: TutorCard[];
}

export const NO_DATA: ReplyData = { followUps: [], actions: [], cards: [] };

function isOpenTopic(value: unknown): value is OpenTopicAction {
  const action = value as Partial<OpenTopicAction> | null;
  return (
    action?.type === "open_topic" &&
    typeof action.subjectSlug === "string" &&
    Number.isInteger(action.topicIndex) &&
    typeof action.topic === "string"
  );
}

function isAddTopic(value: unknown): value is AddTopicAction {
  const action = value as Partial<AddTopicAction> | null;
  return (
    action?.type === "add_topic" &&
    typeof action.subjectSlug === "string" &&
    typeof action.subject === "string" &&
    typeof action.topic === "string" &&
    action.topic.trim().length > 0
  );
}

const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isChangeSubjects(value: unknown): value is ChangeSubjectsAction {
  const action = value as Partial<ChangeSubjectsAction> | null;
  return (
    action?.type === "change_subjects" &&
    isNames(action.add) &&
    isNames(action.remove) &&
    action.add.length + action.remove.length > 0
  );
}

const isRebuildPlan = (value: unknown): value is RebuildPlanAction =>
  (value as Partial<RebuildPlanAction> | null)?.type === "rebuild_plan";

function isOpenSubject(value: unknown): value is OpenSubjectAction {
  const action = value as Partial<OpenSubjectAction> | null;
  return (
    action?.type === "open_subject" &&
    typeof action.subjectSlug === "string" &&
    typeof action.subject === "string"
  );
}

function isProposePath(value: unknown): value is ProposePathAction {
  const action = value as Partial<ProposePathAction> | null;
  return (
    action?.type === "propose_path" &&
    typeof action.goal === "string" &&
    action.goal.trim().length > 0
  );
}

type ActionOf<K extends TutorAction["type"]> = Extract<
  TutorAction,
  { type: K }
>;

const ACTION_CHECKS: {
  [K in TutorAction["type"]]: (value: unknown) => value is ActionOf<K>;
} = {
  open_topic: isOpenTopic,
  open_subject: isOpenSubject,
  add_topic: isAddTopic,
  change_subjects: isChangeSubjects,
  rebuild_plan: isRebuildPlan,
  propose_path: isProposePath,
};

function isTutorAction(value: unknown): value is TutorAction {
  const type = (value as { type?: unknown } | null)?.type;
  return (
    typeof type === "string" &&
    Object.hasOwn(ACTION_CHECKS, type) &&
    ACTION_CHECKS[type as TutorAction["type"]](value)
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isTutorCard(value: unknown): value is TutorCard {
  const card = value as Partial<TutorCard> | null;
  const result = card?.toolResult;
  return (
    typeof card?.resourceUri === "string" &&
    card.resourceUri.startsWith("ui://") &&
    typeof card.toolName === "string" &&
    isObject(card.toolInput) &&
    isObject(result) &&
    Array.isArray(result.content) &&
    (result.structuredContent === undefined ||
      isObject(result.structuredContent))
  );
}

const listOf = <T>(value: unknown, check: (item: unknown) => item is T) =>
  Array.isArray(value) ? value.filter(check) : [];

const isText = (value: unknown): value is string => typeof value === "string";

/** Checked field by field: a malformed part must cost the extras, not the answer. */
export function agentData(message: AgentMessage | undefined): ReplyData {
  if (!message || message.role !== ROLE_AGENT) return NO_DATA;
  const part = (message.parts ?? []).find((p) => p.content?.$case === "data");
  const value = part?.content?.value as Partial<ReplyData> | undefined;
  if (!value) return NO_DATA;
  return {
    followUps: listOf(value.followUps, isText),
    actions: listOf(value.actions, isTutorAction),
    cards: listOf(value.cards, isTutorCard),
  };
}

export function agentText(message: AgentMessage | undefined): string {
  if (!message || message.role !== ROLE_AGENT) return "";
  return (message.parts ?? [])
    .filter((p) => p.content?.$case === "text")
    .map((p) => String(p.content?.value ?? ""))
    .join("");
}

export function activityOf(message: AgentMessage | undefined): string | null {
  if (!message || message.role !== ROLE_AGENT) return null;
  for (const part of message.parts ?? []) {
    const value = part.content?.value as { activity?: unknown } | undefined;
    if (part.content?.$case === "data" && typeof value?.activity === "string") {
      return value.activity;
    }
  }
  return null;
}
