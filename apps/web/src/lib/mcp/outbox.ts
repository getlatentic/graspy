import type { CallToolResult } from "@modelcontextprotocol/client";
import { committed, openDB, OUTBOX_STORE, promisify } from "@/lib/idb";
import { pinLearner } from "@/lib/learner-pin";
import { callAppTool, reachServer, type ServerPin } from "./server";
import { refusesTheCall } from "./refusal";

// A view's tools/call the server did not take is kept and sent in order later. These calls
// record what the learner did, and the server takes each again without harm. Each call and
// each run is pinned to the learner it was made for: once the device learns as someone else,
// it sends nothing more and keeps nothing in the next learner's outbox.
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

async function keep(
  pin: ServerPin,
  name: string,
  args: Record<string, unknown>,
) {
  const db = await openDB();
  pin.hold();
  const store = db
    .transaction(OUTBOX_STORE, "readwrite")
    .objectStore(OUTBOX_STORE);
  const call: KeptCall = { name, args, keptAt: Date.now() };
  await promisify(store.add(call));
}

async function kept(
  pin: ServerPin,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  await keep(pin, name, args);
  return KEPT;
}

export async function callOrKeep(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const pin = pinLearner();
  // As the run does: a connection refused, whatever its status, is not the server refusing a call.
  try {
    await reachServer(pin);
  } catch {
    return kept(pin, name, args);
  }
  try {
    return await callAppTool(name, args, pin);
  } catch (error) {
    // Kept as the outbox's run keeps it: until the server refuses this very call.
    if (refusesTheCall(error)) throw error;
    return kept(pin, name, args);
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

async function sendAll(pin: ServerPin): Promise<number> {
  const calls = await keptCalls();
  if (calls.length === 0) return 0;
  // A connection refused, whatever its status, is not the server refusing a call.
  try {
    await reachServer(pin);
  } catch {
    return 0;
  }
  let sent = 0;
  for (const call of calls) {
    try {
      // Once the device learns as someone else this stops the run: the rest go with the wipe.
      await callAppTool(call.name, call.args, pin);
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

// One run at a time for a learner. A run pinned to a learner the device has left holds none
// back for the next, however long the call it is waiting on hangs, nor for the same learner
// back on the device.
let sending: { pin: ServerPin; run: Promise<number> } | null = null;

function started(pin: ServerPin): Promise<number> {
  const run: Promise<number> = sendAll(pin).finally(() => {
    if (sending?.run === run) sending = null;
  });
  sending = { pin, run };
  return run;
}

export function sendKept(): Promise<number> {
  if (sending?.pin.holds()) return sending.run;
  return started(pinLearner());
}

/** Sends what was kept; false while some of it is still on the device. */
export async function sentEverything(): Promise<boolean> {
  await sendKept();
  return (await keptCalls()).length === 0;
}
