import type { CallToolResult } from "@modelcontextprotocol/client";
import { committed, openDB, OUTBOX_STORE, promisify } from "@/lib/idb";
import { callAppTool, reachServer } from "./server";
import { refusesTheCall } from "./refusal";

// A view's tools/call the server did not take is kept and sent in order later. These calls
// record what the learner did, and the server takes each again without harm.
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
      text: "This is kept on the device and sent later.",
    },
  ],
};

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
    // Kept as the outbox's run keeps it: until the server refuses this very call.
    if (refusesTheCall(error)) throw error;
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
  const calls = await keptCalls();
  if (calls.length === 0) return 0;
  // A connection refused, whatever its status, is not the server refusing a call.
  try {
    await reachServer();
  } catch {
    return 0;
  }
  let sent = 0;
  for (const call of calls) {
    try {
      await callAppTool(call.name, call.args);
    } catch (error) {
      // What the learner did stays on the device until the server refuses this very call.
      if (!refusesTheCall(error)) break;
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

/** Sends what was kept; false while some of it is still on the device. */
export async function sentEverything(): Promise<boolean> {
  await sendKept();
  return (await keptCalls()).length === 0;
}
