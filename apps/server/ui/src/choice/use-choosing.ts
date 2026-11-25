import { useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { readViewState, writeViewState } from "@/shared/view-state";

export type Picked = number | "other" | null;

const isPicked = (value: unknown): value is Picked =>
  value === null || value === "other" || Number.isInteger(value);

/** The tap is the learner's answer: it goes to the chat as their next message. */
export function useChoosing(app: App, viewUUID: string, options: string[]) {
  const stateKey = `graspy.choice.${viewUUID}`;
  const [picked, setPicked] = useState<Picked>(() =>
    readViewState(stateKey, isPicked, null),
  );
  // The host refuses a message while graspy is still answering the last.
  const [busy, setBusy] = useState(false);

  const keep = (next: Picked) => {
    setPicked(next);
    writeViewState(stateKey, next);
  };

  const choose = async (index: number) => {
    keep(index);
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: options[index] }],
      });
      setBusy(Boolean(isError));
      if (isError) keep(null);
    } catch (error) {
      console.error("Sending the choice failed:", error);
      keep(null);
    }
  };

  return { picked, busy, choose, other: () => keep("other") };
}
