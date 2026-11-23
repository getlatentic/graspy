import {
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";

/** What a code is made of: letters and digits; the rest is spaces, dashes and other things a
 * paste brings. Upper case, which is how codes are shown. */
const characters = (typed: string) =>
  typed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * A short code, a box for each character, for a phone: the first box has the focus, typing moves
 * to the next, Backspace to the one before, and a paste or a keyboard's autofill fills the rest.
 * `onComplete` is called once, as the last box is filled, with the whole code. The letters are
 * upper case, and the keyboard offers them so.
 */
export function CodeBoxes({
  length,
  label,
  onComplete,
  disabled = false,
  invalid = false,
  className,
}: {
  length: number;
  label: string;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [typed, setTyped] = useState<string[]>(() =>
    Array.from({ length }, () => ""),
  );
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  const settle = (next: string[], focus: number) => {
    setTyped(next);
    boxes.current[Math.min(focus, length - 1)]?.focus();
    if (next.every(Boolean)) onComplete(next.join(""));
  };

  // Puts `incoming` into the boxes from `from`, as far as they go.
  const fill = (from: number, incoming: string) => {
    const next = [...typed];
    let at = from;
    for (const character of incoming) {
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

  const backspace = (index: number, event: KeyboardEvent) => {
    if (event.key !== "Backspace" || typed[index] || index === 0) return;
    event.preventDefault();
    const next = [...typed];
    next[index - 1] = "";
    setTyped(next);
    boxes.current[index - 1]?.focus();
  };

  const paste = (index: number, event: ClipboardEvent) => {
    event.preventDefault();
    fill(index, characters(event.clipboardData.getData("text")));
  };

  return (
    <div
      role="group"
      aria-label={label}
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
          onChange={(event) => change(index, event.target.value)}
          onKeyDown={(event) => backspace(index, event)}
          onPaste={(event) => paste(index, event)}
          onFocus={(event) => event.target.select()}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid}
          disabled={disabled}
          autoFocus={index === 0}
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
