import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import {
  RESOURCE_MIME_TYPE,
  isToolVisibilityModelOnly,
  type McpUiResourceCsp,
  type McpUiResourcePermissions,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { fetchWithSession } from "@/lib/api/session";
import { API_BASE_URL } from "@/lib/env";
import { pinLearner, type LearnerPin } from "@/lib/learner-pin";
import { NotForViews } from "./refusal";
import { keepSandbox } from "./sandbox";
import { isUnreachable } from "./unreachable";
import { keepView, keptSandboxes, keptView } from "./view-copies";

// The app is an MCP Apps host; graspy's server serves the views and runs their tools.
const API_ORIGIN = new URL(API_BASE_URL).origin;
const MCP_URL = new URL("/mcp", API_ORIGIN);
export const HOST_INFO = { name: "graspy", version: "1.0.0" };
const UI_EXTENSION = "io.modelcontextprotocol/ui";
// graspy's own: the sandbox of the build a view's page belongs to.
const SANDBOX_META = "graspy/sandbox";

export interface UiView {
  html: string;
  title: string;
  /** The path, on the server, of the sandbox the page opens in. */
  sandbox: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
}

interface Connection {
  client: Client;
  /** MCP Apps refuses a view any tool that is the model's alone. */
  appTools: Set<string>;
  viewOf: Map<string, string>;
  titles: Map<string, string>;
  views: Map<string, Promise<UiView>>;
}

export type ServerPin = LearnerPin<string>;

// Each session holder has a connection of their own, pinned to them, whose every request goes
// under their session: once the device learns as someone else, it sends nothing more. The
// device signed out is one holder, not its id, which is new on each read where storage is
// refused.
let connection: { pin: ServerPin; made: Promise<Connection> } | null = null;

async function connect(pin: ServerPin): Promise<Connection> {
  const client = new Client(HOST_INFO, {
    capabilities: {
      extensions: { [UI_EXTENSION]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    },
  });
  const fetch = (url: string | URL, init?: RequestInit) =>
    fetchWithSession(url, init, pin.holds);
  await client.connect(new StreamableHTTPClientTransport(MCP_URL, { fetch }));
  const [{ tools }, { resources }] = await Promise.all([
    client.listTools(),
    client.listResources(),
  ]);
  return {
    client,
    titles: new Map(
      resources.map((resource) => [
        resource.uri,
        resource.title ?? resource.name,
      ]),
    ),
    appTools: new Set(
      tools
        .filter((tool) => !isToolVisibilityModelOnly(tool))
        .map((tool) => tool.name),
    ),
    viewOf: new Map(
      tools.flatMap((tool) => {
        const uri = (
          tool._meta as { ui?: { resourceUri?: unknown } } | undefined
        )?.ui?.resourceUri;
        return typeof uri === "string" ? [[tool.name, uri] as const] : [];
      }),
    ),
    views: new Map(),
  };
}

function opened(pin: ServerPin): Promise<Connection> {
  const made: Promise<Connection> = connect(pin).catch((error: unknown) => {
    if (connection?.made === made) connection = null;
    throw error;
  });
  return made;
}

function closeLeft(left: Promise<Connection>): void {
  left.then(({ client }) => client.close()).catch(() => undefined);
}

const servesNow = (now: ServerPin) =>
  connection?.pin.learner === now.learner && connection.pin.holds();

/** The connection for the learner `pin` holds; none once the device learns as someone else.
 * Work the device's sign-in joined goes under the account's connection. */
function server(pin: ServerPin = pinLearner()): Promise<Connection> {
  pin.hold();
  const now = pinLearner();
  if (connection && servesNow(now)) return connection.made;
  if (connection) closeLeft(connection.made);
  connection = { pin: now, made: opened(now) };
  return connection.made;
}

async function readView(
  client: Client,
  uri: string,
  title: string,
): Promise<UiView> {
  const { contents } = await client.readResource({ uri });
  const [content] = contents;
  if (contents.length !== 1 || content.mimeType !== RESOURCE_MIME_TYPE) {
    throw new Error(`${uri} is not an MCP App view`);
  }
  const html = "text" in content ? content.text : atob(content.blob);
  const meta = content._meta as
    | { ui?: Pick<UiView, "csp" | "permissions">; [SANDBOX_META]?: unknown }
    | undefined;
  const sandbox = meta?.[SANDBOX_META];
  if (typeof sandbox !== "string" || !sandbox.startsWith("/")) {
    throw new Error(`${uri} names no sandbox`);
  }
  const ui = meta?.ui;
  return { html, title, sandbox, csp: ui?.csp, permissions: ui?.permissions };
}

async function readOnce(uri: string): Promise<UiView> {
  const { client, titles, views } = await server();
  let view = views.get(uri);
  if (!view) {
    view = readView(client, uri, titles.get(uri) ?? uri);
    views.set(uri, view);
    view.catch(() => views.delete(uri));
  }
  return view;
}

/** The view to show, read once per visit; with no server to reach, the copy kept. A refusal is its answer. */
export async function uiView(uri: string): Promise<UiView> {
  try {
    return await readOnce(uri);
  } catch (error) {
    const kept = isUnreachable(error) ? keptView(uri) : null;
    if (kept) return kept;
    throw error;
  }
}

/** Connects, or rejects with why it could not. */
export async function reachServer(pin?: ServerPin): Promise<void> {
  await server(pin);
}

/** Calls a view's tool, for the learner `pin` holds when given. */
export async function callAppTool(
  name: string,
  args: Record<string, unknown>,
  pin?: ServerPin,
): Promise<CallToolResult> {
  const { client, appTools } = await server(pin);
  if (!appTools.has(name)) throw new NotForViews(name);
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** The view `name`'s result is shown in. */
export async function viewOf(name: string): Promise<string> {
  const resourceUri = (await server()).viewOf.get(name);
  if (!resourceUri) throw new Error(`${name} has no view`);
  return resourceUri;
}

export async function openToolView(
  name: string,
  args: Record<string, unknown>,
): Promise<TutorCard> {
  const resourceUri = await viewOf(name);
  const toolResult = await callAppTool(name, args);
  if (toolResult.isError) throw new Error(`${name} was refused`);
  return { resourceUri, toolName: name, toolInput: args, toolResult };
}

/**
 * Keeps every view's page to open without a connection. A page replaces its copy only once its
 * sandbox's worker holds every file of its build, so a copy never names files no worker holds; a
 * sandbox no kept page needs any more is dropped.
 */
async function keepAllViews(): Promise<void> {
  const { titles } = await server();
  const read = await Promise.all(
    [...titles.keys()].map(async (uri): Promise<[string, UiView]> => [
      uri,
      await readOnce(uri),
    ]),
  );
  const sandboxes = new Set(read.map(([, view]) => view.sandbox));
  for (const sandbox of sandboxes) {
    const needed = new Set([...keptSandboxes(), ...sandboxes]);
    if (!(await keepSandbox(sandbox, needed))) continue;
    for (const [uri, view] of read) {
      if (view.sandbox === sandbox) keepView(uri, view);
    }
  }
}

let keeping: Promise<void> | null = null;

/** Keeps every view, once at a time however often it is asked. */
export function readAllViews(): Promise<void> {
  keeping ??= keepAllViews().finally(() => {
    keeping = null;
  });
  return keeping;
}
