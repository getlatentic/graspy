import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { buttonStyles } from "./button-styles";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface PinPadProps {
  /** Names the pad for a screen reader. */
  label: string;
  /** Says how many digits make the PIN, and it is sent when the last is typed. Without it
   * the length is the person's, between `min` and `max`, and it is sent by `doneLabel`'s
   * button or at `max`. */
  length?: number;
  min?: number;
  max?: number;
  doneLabel?: string;
  /** The word for the key that deletes the last digit, for a screen reader. */
  deleteLabel: string;
  /** What an entry of digits is told to say when it is typed in full. */
  onEntered: (pin: string) => void;
  /** Stops the keys while an entry is being checked. */
  busy?: boolean;
  /** Goes up each time an entry was not accepted: the pad shakes and clears itself. */
  failures?: number;
  /** Why the last entry was not accepted. */
  error?: string | null;
  /** Said to a screen reader as digits are typed, with how many there are so far. */
  typedLabel: (count: number) => string;
}

/** A numeric pad for a PIN: big buttons that take a touch, a pointer, the arrow keys and OK of a
 * remote, and the number keys of a keyboard or remote. The digits typed are kept in this
 * component's state and are never put in the page: the dots only count them, and there is no
 * field, so nothing is offered to a password manager, a paste or an autofill. */
export function PinPad({
  label,
  length,
  min = 4,
  max = 8,
  doneLabel,
  deleteLabel,
  onEntered,
  busy = false,
  failures = 0,
  error = null,
  typedLabel,
}: PinPadProps) {
  const [digits, setDigits] = useState("");
  const full = length ?? max;

  const press = useCallback(
    (digit: string) =>
      setDigits((typed) => (typed.length < full ? typed + digit : typed)),
    [full],
  );
  const erase = useCallback(() => setDigits((typed) => typed.slice(0, -1)), []);

  // An entry that was not accepted starts again, in the render that shows the error, so a digit
  // typed at once is not lost to an effect that has yet to run.
  const [seenFailures, setSeenFailures] = useState(failures);
  if (seenFailures !== failures) {
    setSeenFailures(failures);
    setDigits("");
  }

  // Sent once, when the digits are complete: a new callback on a render does not send it again.
  const entered = useRef(onEntered);
  useEffect(() => {
    entered.current = onEntered;
  });
  useEffect(() => {
    if (digits.length === full) entered.current(digits);
  }, [digits, full]);

  useEffect(() => {
    if (busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        erase();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, press, erase]);

  const dots = Math.max(length ?? min, digits.length);
  const key = cn(buttonStyles("secondary", "lg"), "h-16 w-full text-2xl");

  return (
    <div
      role="group"
      aria-label={label}
      onPaste={(event) => event.preventDefault()}
      className="mx-auto flex w-full max-w-72 flex-col items-center gap-6"
    >
      <div
        key={failures}
        className={cn("flex h-4 gap-4", failures > 0 && "animate-shake")}
        aria-hidden="true"
      >
        {Array.from({ length: dots }, (_, at) => (
          <span
            key={at}
            data-filled={at < digits.length ? "" : undefined}
            className="size-4 rounded-full border-2 border-ink data-[filled]:bg-ink"
          />
        ))}
      </div>
      <p role="status" className="sr-only">
        {typedLabel(digits.length)}
      </p>
      <p role="alert" className="min-h-6 text-center text-sm text-danger">
        {error}
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={key}
            disabled={busy}
            onClick={() => press(digit)}
            autoFocus={digit === "1"}
          >
            {digit}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className={key}
          disabled={busy}
          onClick={() => press("0")}
        >
          0
        </button>
        <button
          type="button"
          className={cn(buttonStyles("ghost", "lg"), "h-16 w-full")}
          disabled={busy || digits.length === 0}
          onClick={erase}
          aria-label={deleteLabel}
        >
          <Delete className="size-6 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </div>
      {length === undefined && doneLabel && (
        <button
          type="button"
          className={cn(buttonStyles("primary", "lg"), "w-full")}
          disabled={busy || digits.length < min}
          onClick={() => onEntered(digits)}
        >
          {doneLabel}
        </button>
      )}
    </div>
  );
}
