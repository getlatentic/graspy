const APP_CALLS_KEY = "appCalls";
const UNANSWERED_KEY = "unanswered";

export interface AppCallRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: { name: string; arguments: Record<string, unknown> };
}

export function isAppCall(value: unknown): value is AppCallRequest {
  const call = value as Partial<AppCallRequest> | null;
  const params = call?.params;
  return (
    call?.jsonrpc === "2.0" &&
    typeof call.id === "number" &&
    call.method === "tools/call" &&
    typeof params?.name === "string" &&
    typeof params.arguments === "object" &&
    params.arguments !== null &&
    !Array.isArray(params.arguments)
  );
}

let lastId = 0;

export function appCall(
  name: string,
  args: Record<string, unknown>,
): AppCallRequest {
  lastId += 1;
  return {
    jsonrpc: "2.0",
    id: lastId,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

type Part =
  | { content: { $case: "text"; value: string } }
  | { content: { $case: "data"; value: Record<string, unknown> } };

interface Beside {
  calls?: AppCallRequest[];
  unanswered?: string[];
}

export function messageParts(
  text: string,
  { calls = [], unanswered = [] }: Beside = {},
): Part[] {
  const data = {
    ...(calls.length ? { [APP_CALLS_KEY]: calls } : {}),
    ...(unanswered.length ? { [UNANSWERED_KEY]: unanswered } : {}),
  };
  return [
    { content: { $case: "text", value: text } },
    ...(Object.keys(data).length
      ? [{ content: { $case: "data" as const, value: data } }]
      : []),
  ];
}
