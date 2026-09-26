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
import { NotForViews } from "./refusal";
import { isUnreachable } from "./unreachable";

// The app is an MCP Apps host; graspy's server serves the views and runs their tools.
const API_ORIGIN = new URL(API_BASE_URL).origin;
const MCP_URL = new URL("/mcp", API_ORIGIN);
/** On the server's origin, never the app's. */
export const SANDBOX_URL = new URL("/ui-sandbox", API_ORIGIN);
export const HOST_INFO = { name: "graspy", version: "1.0.0" };
const UI_EXTENSION = "io.modelcontextprotocol/ui";

export interface UiView {
  html: string;
  title: string;
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

let connection: Promise<Connection> | null = null;

async function connect(): Promise<Connection> {
  const client = new Client(HOST_INFO, {
    capabilities: {
      extensions: { [UI_EXTENSION]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    },
  });
  await client.connect(
    new StreamableHTTPClientTransport(MCP_URL, { fetch: fetchWithSession }),
  );
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

function server(): Promise<Connection> {
  connection ??= connect().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
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
  const ui = (
    content._meta as { ui?: Pick<UiView, "csp" | "permissions"> } | undefined
  )?.ui;
  return { html, title, csp: ui?.csp, permissions: ui?.permissions };
}

async function readOnce(uri: string): Promise<UiView> {
  const { client, titles, views } = await server();
  let view = views.get(uri);
  if (!view) {
    view = readView(client, uri, titles.get(uri) ?? uri);
    views.set(uri, view);
    view.then(
      (read) => keepView(uri, read),
      () => views.delete(uri),
    );
  }
  return view;
}

// Kept so a view still opens after a reload without a connection. The document is small:
// its scripts and styles are files the sandbox's worker keeps.
const keptKey = (uri: string) => `graspy.view.${uri}`;

function keepView(uri: string, view: UiView): void {
  try {
    window.localStorage.setItem(keptKey(uri), JSON.stringify(view));
  } catch {
    // Storage refused: the view opens only with a connection.
  }
}

function keptView(uri: string): UiView | null {
  try {
    const kept = window.localStorage.getItem(keptKey(uri));
    return kept ? (JSON.parse(kept) as UiView) : null;
  } catch {
    return null;
  }
}

/** Read once per visit; with no server to reach, the copy last read. A refusal is its answer. */
export async function uiView(uri: string): Promise<UiView> {
  try {
    return await readOnce(uri);
  } catch (error) {
    const kept = isUnreachable(error) ? keptView(uri) : null;
    if (kept) return kept;
    throw error;
  }
}

export async function callAppTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const { client, appTools } = await server();
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

export async function readAllViews(): Promise<void> {
  const { titles } = await server();
  await Promise.all([...titles.keys()].map(uiView));
}
