import { useMemo, useRef, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { PathChoice } from "@/lib/content";
import { readViewState, writeViewState } from "@/shared/view-state";
import { fill, type Words } from "@/shared/words";
import { answerText, stepKey, MAX_CHANGES } from "./answer-text";

interface Kept {
  /** The topics the learner left out, by `stepKey`: all are in until they say otherwise. */
  off: string[];
  sent: boolean;
}

const isKept = (value: unknown): value is Kept => {
  const kept = value as Partial<Kept> | null;
  return (
    Array.isArray(kept?.off) &&
    kept.off.every((key) => typeof key === "string") &&
    typeof kept.sent === "boolean"
  );
};

/** The learner's choice among a path's topics. Nothing leaves the card until they answer: the
 * answer, or what they say is missing, goes to the chat once as their next message, and the card
 * is kept as answered only once the host has taken it. */
export function usePathChoice(
  app: App,
  viewUUID: string,
  choice: PathChoice,
  words: Words["path"],
) {
  const stateKey = `graspy.path.${viewUUID}`;
  const [kept, setKept] = useState<Kept>(() =>
    readViewState(stateKey, isKept, { off: [], sent: false }),
  );
  // Not the state: a second press in the same frame reads the state before it changes.
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(false);
  const [saying, setSaying] = useState(false);
  const [note, setNote] = useState("");

  const off = useMemo(() => new Set(kept.off), [kept.off]);
  const chosen = choice.paths.reduce(
    (count, path, at) =>
      count +
      path.steps.filter((_, step) => !off.has(stepKey(at, step))).length,
    0,
  );
  const locked = kept.sent || pending;

  const keep = (next: Kept) => {
    setKept(next);
    writeViewState(stateKey, next);
  };

  const toggle = (path: number, step: number) => {
    if (locked) return;
    const key = stepKey(path, step);
    keep({
      ...kept,
      off: off.has(key)
        ? kept.off.filter((k) => k !== key)
        : [...kept.off, key],
    });
  };

  const send = async (text: string) => {
    if (sending.current || locked) return;
    sending.current = true;
    setPending(true);
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
      setRefused(Boolean(isError));
      if (!isError) keep({ ...kept, sent: true });
    } catch (error) {
      console.error("Sending the path's answer failed:", error);
      setRefused(true);
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  const said = note.trim();
  return {
    off,
    chosen,
    sent: locked,
    refused,
    saying,
    note,
    canAdd: chosen > 0 && !locked,
    canSay: said !== "" && !locked,
    toggle,
    write: (text: string) => setNote(text.slice(0, MAX_CHANGES)),
    openNote: () => setSaying(true),
    add: () => send(answerText(choice.paths, off)),
    say: () => send(fill(words.ask, { text: said })),
  };
}
