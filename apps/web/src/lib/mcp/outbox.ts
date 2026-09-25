import type { CallToolResult } from "@modelcontextprotocol/client";
import { committed, openDB, OUTBOX_STORE, promisify } from "@/lib/idb";
import { callAppTool } from "./server";

// A view's tools/call made offline is kept and sent in order once back. These calls record
// what the learner did, and the server takes each again without harm.
interface KeptCall {
  id?: number;
  name: string;
  args: Record<string, unknown>;
  keptAt: number;
}

const KEPT: CallToolResult = {
  content: [
    {
      type: "text",
      text: "There is no connection: this is kept, and sent once there is.",
    },
  ],
};

/** As opposed to the server refusing. */
export function isUnreachable(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

async function keep(name: string, args: Record<string, unknown>) {
  const db = await openDB();
  const store = db
    .transaction(OUTBOX_STORE, "readwrite")
    .objectStore(OUTBOX_STORE);
  const call: KeptCall = { name, args, keptAt: Date.now() };
  await promisify(store.add(call));
}

export async function callOrKeep(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    return await callAppTool(name, args);
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    await keep(name, args);
    return KEPT;
  }
}

async function keptCalls(): Promise<KeptCall[]> {
  const db = await openDB();
  const store = db
    .transaction(OUTBOX_STORE, "readonly")
    .objectStore(OUTBOX_STORE);
  return promisify<KeptCall[]>(store.getAll());
}

async function forget(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const done = committed(tx);
  tx.objectStore(OUTBOX_STORE).delete(id);
  await done;
}

async function sendAll(): Promise<number> {
  let sent = 0;
  for (const call of await keptCalls()) {
    try {
      await callAppTool(call.name, call.args);
    } catch (error) {
      if (isUnreachable(error)) break;
      // Refused now, it would be refused every time.
      console.warn(`The server refused a kept ${call.name}:`, error);
    }
    await forget(call.id!);
    sent += 1;
  }
  return sent;
}

let sending: Promise<number> | null = null;

export function sendKept(): Promise<number> {
  sending ??= sendAll().finally(() => {
    sending = null;
  });
  return sending;
}

/** Sends what was kept; false while some of it cannot reach the server. */
export async function sentEverything(): Promise<boolean> {
  await sendKept();
  return (await keptCalls()).length === 0;
}
