import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { ArrowUp, Square } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/lib/i18n-context";

/** A new `id` per request, so the same words asked for twice fill it again. */
export interface DraftSeed {
  text: string;
  id: string;
}

// On a touch keyboard return writes a new line, as in any messaging app.
const TOUCH = "(pointer: coarse)";

interface ChatComposerProps {
  placeholder: string;
  /** Sending is not possible now, though the learner may keep typing. */
  blocked: boolean;
  answering: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  seed: DraftSeed | null;
}

export function ChatComposer({
  placeholder,
  blocked,
  answering,
  onSend,
  onStop,
  seed,
}: ChatComposerProps) {
  const touch = useMediaQuery(TOUCH);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useSeededDraft(seed, fieldRef);
  useGrowWithText(fieldRef, draft);

  const send = () => {
    const text = draft.trim();
    if (!text || blocked) return;
    setDraft("");
    // On a phone the keyboard would cover the answer about to arrive.
    if (touch) fieldRef.current?.blur();
    onSend(text);
  };

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface py-1.5 ps-4 pe-1.5 focus-within:border-accent">
      <textarea
        ref={fieldRef}
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (touch || !sendsOnEnter(event)) return;
          event.preventDefault();
          send();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        dir="auto"
        // Otherwise iOS Safari offers AutoFill buttons above the keyboard.
        autoComplete="off"
        // Never disabled: that drops focus and closes a phone's keyboard. 16px
        // text on phones, below which iOS zooms in on focus.
        className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base text-ink outline-none placeholder:truncate placeholder:text-muted sm:text-sm"
      />
      {answering ? (
        <StopButton onStop={onStop} />
      ) : (
        <SendButton
          onSend={send}
          disabled={blocked || draft.trim().length === 0}
        />
      )}
    </div>
  );
}

const sendsOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing;

function useSeededDraft(
  seed: DraftSeed | null,
  fieldRef: RefObject<HTMLTextAreaElement | null>,
) {
  const draft = useState("");
  const [, setDraft] = draft;
  useEffect(() => {
    if (!seed) return;
    setDraft(seed.text);
    fieldRef.current?.focus({ preventScroll: true });
  }, [fieldRef, seed, setDraft]);
  return draft;
}

/** Empty, it stays one line: measuring would fit a placeholder that wraps. */
function useGrowWithText(
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  text: string,
) {
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    if (text) field.style.height = `${field.scrollHeight}px`;
  }, [fieldRef, text]);
}

function StopButton({ onStop }: { onStop: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onStop}
      aria-label={t("chat.stop")}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-surface hover:bg-ink/80"
    >
      <Square className="size-3.5 fill-current" aria-hidden="true" />
    </button>
  );
}

function SendButton({
  onSend,
  disabled,
}: {
  onSend: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSend}
      // Keeps focus in the field; send decides where it goes.
      onMouseDown={(event) => event.preventDefault()}
      disabled={disabled}
      aria-label={t("chat.send")}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-strong disabled:bg-track disabled:text-muted"
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </button>
  );
}
