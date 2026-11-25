import { useRef, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { readViewState, writeViewState } from "@/shared/view-state";

export type Picked = number | "other" | null;

const isPicked = (value: unknown): value is Picked =>
  value === null || value === "other" || Number.isInteger(value);

/** The tap is the learner's answer: it goes to the chat as their next message, once. A card
 * answered stays answered, showing the option chosen; one the host refuses is not. */
export function useChoosing(app: App, viewUUID: string, options: string[]) {
  const stateKey = `graspy.choice.${viewUUID}`;
  const [picked, setPicked] = useState<Picked>(() =>
    readViewState(stateKey, isPicked, null),
  );
  // Not the state: a second tap in the same frame reads the state before it changes.
  const sending = useRef(false);
  // The host refuses a message while graspy is still answering, or for a card that is
  // no longer the last thing in the chat.
  const [refused, setRefused] = useState(false);

  const keep = (next: Picked) => {
    setPicked(next);
    writeViewState(stateKey, next);
  };

  const choose = async (index: number) => {
    if (sending.current || typeof picked === "number") return;
    sending.current = true;
    keep(index);
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: options[index] }],
      });
      setRefused(Boolean(isError));
      if (isError) keep(null);
    } catch (error) {
      console.error("Sending the choice failed:", error);
      keep(null);
    } finally {
      sending.current = false;
    }
  };

  return {
    picked,
    answered: typeof picked === "number",
    refused,
    choose,
    other: () => keep("other"),
  };
}
