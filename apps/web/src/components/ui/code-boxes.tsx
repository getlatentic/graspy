import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";

/**
 * What a code is made of: letters and digits, upper case, which is how codes are shown. A paste
 * brings spaces and dashes, which go; digits written in other scripts (the Arabic-Indic of a
 * phone set to Arabic, full-width ones from an input method) are the digits they stand for, not
 * dropped. Anything else is not part of a code and is left out.
 */
const characters = (typed: string) =>
  typed
    .normalize("NFKC")
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

/**
 * A short code, a box for each character, for a phone: the first box has the focus, typing moves
 * to the next, Backspace to the one before (as a hardware key, and as the soft keyboards that
 * send it as an edit), and a paste or a keyboard's autofill fills them. A whole code pasted into
 * fewer boxes puts its last characters in them, which is the end of it. `onComplete` is called
 * when the last box is filled, once for each value, with the whole code.
 */
export function CodeBoxes({
  length,
  label,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = true,
  describedBy,
  className,
}: {
  length: number;
  label: string;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** The id of what tells the person what to type. */
  describedBy?: string;
  className?: string;
}) {
  const [typed, setTyped] = useState<string[]>(() =>
    Array.from({ length }, () => ""),
  );
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const composing = useRef(false);
  const completed = useRef<string | null>(null);
  // What the soft keyboards' listeners read, so they are set once.
  const current = useRef(typed);
  current.current = typed;

  const settle = (next: string[], focus: number) => {
    setTyped(next);
    boxes.current[Math.min(focus, length - 1)]?.focus();
    const whole = next.join("");
    if (next.every(Boolean) && whole !== completed.current) {
      completed.current = whole;
      onComplete(whole);
    }
  };

  // Puts `incoming` into the boxes. A whole code, or more than fits, goes in by its end.
  const fill = (from: number, incoming: string) => {
    const next = [...typed];
    const whole = incoming.length >= length;
    const placed = whole ? incoming.slice(-length) : incoming;
    let at = whole ? 0 : from;
    for (const character of placed) {
      if (at >= length) break;
      next[at] = character;
      at += 1;
    }
    settle(next, at);
  };

  const change = (index: number, value: string) => {
    const incoming = characters(value);
    if (incoming === "") {
      const next = [...typed];
      next[index] = "";
      completed.current = null;
      setTyped(next);
      return;
    }
    // Typing into a box that holds a character leaves two: the new one replaces the old.
    const fresh =
      typed[index] && incoming.length === 2
        ? incoming[0] === typed[index]
          ? incoming[1]
          : incoming[0]
        : incoming;
    fill(index, fresh);
  };

  const goBack = useCallback((index: number) => {
    const next = [...current.current];
    next[index - 1] = "";
    completed.current = null;
    setTyped(next);
    boxes.current[index - 1]?.focus();
  }, []);

  const backspace = (index: number, event: KeyboardEvent) => {
    if (event.key !== "Backspace" || typed[index] || index === 0) return;
    event.preventDefault();
    goBack(index);
  };

  // Soft keyboards (Gboard among them) send no Backspace key in an empty box, and no change
  // either, since nothing changes: the edit is all there is.
  useEffect(() => {
    const listeners = boxes.current.map((box, index) => {
      const onBeforeInput = (event: Event) => {
        const { inputType } = event as InputEvent;
        if (
          inputType !== "deleteContentBackward" ||
          current.current[index] ||
          index === 0
        ) {
          return;
        }
        event.preventDefault();
        goBack(index);
      };
      box?.addEventListener("beforeinput", onBeforeInput);
      return () => box?.removeEventListener("beforeinput", onBeforeInput);
    });
    return () => listeners.forEach((remove) => remove());
  }, [goBack, length]);

  const paste = (index: number, event: ClipboardEvent) => {
    event.preventDefault();
    fill(index, characters(event.clipboardData.getData("text")));
  };

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      dir="ltr"
      className={cn("flex justify-center gap-2", className)}
    >
      {typed.map((character, index) => (
        <input
          key={index}
          ref={(box) => {
            boxes.current[index] = box;
          }}
          value={character}
          onChange={(event) => {
            // An input method is still composing: what it sends is not yet what was typed.
            if (!composing.current) change(index, event.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            change(index, event.currentTarget.value);
          }}
          onKeyDown={(event) => backspace(index, event)}
          onPaste={(event) => paste(index, event)}
          onFocus={(event) => event.target.select()}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
          className="h-14 min-w-0 max-w-12 flex-1 rounded-control border-2 border-line bg-surface text-center font-mono text-2xl font-bold uppercase text-ink outline-none transition-colors focus-visible:border-accent aria-invalid:border-danger disabled:opacity-60"
        />
      ))}
    </div>
  );
}
