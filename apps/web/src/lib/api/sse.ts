import { NetworkError, toApiError, toNetworkError } from "./errors";
import { fetchWithSession } from "./session";

const HEARTBEAT_EVENT = "ping";
const DONE = Symbol("done");

async function openStream(
  url: string,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  let response: Response;
  try {
    response = await fetchWithSession(url, {
      headers: { Accept: "text/event-stream" },
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
  if (!response.ok) throw await toApiError(response);
  if (!response.body) {
    throw new NetworkError("Stream closed before any data arrived");
  }
  return response.body.getReader();
}

function parseEvent<T>(event: string): T | typeof DONE | null {
  const lines = event.split(/\n|\r\n/);
  const eventLine = lines.find((line) => line.startsWith("event: "));
  if (eventLine?.slice(7).trim() === HEARTBEAT_EVENT) return null;
  const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
  if (data === undefined) return null;
  if (data.trim() === "[DONE]") return DONE;
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.error("Failed to parse SSE message:", data, error);
    return null;
  }
}

export async function* createSSEStream<T>(url: string): AsyncGenerator<T> {
  const reader = await openStream(url);
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (
      let read = await reader.read();
      !read.done;
      read = await reader.read()
    ) {
      buffer += decoder.decode(read.value, { stream: true });
      const events = buffer.split(/\n\n|\r\n\r\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        const parsed = parseEvent<T>(event);
        if (parsed === DONE) return;
        if (parsed !== null) yield parsed;
      }
    }
  } finally {
    // Releasing the lock alone would leave the server generating for nobody.
    await reader.cancel().catch(() => {});
  }
}
