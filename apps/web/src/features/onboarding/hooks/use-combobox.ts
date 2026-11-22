import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { useBackHandler } from "@/hooks/use-back-handler";
import {
  neighbourLetterIndex,
  PAGE_SIZE,
  TYPE_AHEAD_MS,
  typeAheadIndex,
} from "../lib/option-jump";
import { matchingOptions, type SelectOption } from "../lib/select-options";

/** Keys the list takes for itself, so the page does not scroll behind it. */
const MOVES_IN_LIST = new Set([
  "ArrowDown",
  "ArrowUp",
  "Enter",
  "PageDown",
  "PageUp",
]);

interface ListControls {
  isOpen: boolean;
  matches: SelectOption[];
  highlighted: number;
  setHighlighted: Dispatch<SetStateAction<number>>;
  setIsOpen: (open: boolean) => void;
  open: () => void;
  close: () => void;
  select: (value: string) => void;
}

const clamp = (index: number, count: number) =>
  Math.max(0, Math.min(index, count - 1));

function keyActions(list: ListControls): Record<string, () => void> {
  const { isOpen, matches, highlighted, setHighlighted } = list;
  const move = (by: number) =>
    isOpen ? setHighlighted((i) => clamp(i + by, matches.length)) : list.open();
  return {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    PageDown: () => move(PAGE_SIZE),
    PageUp: () => move(-PAGE_SIZE),
    Enter: () =>
      isOpen && matches[highlighted]
        ? list.select(matches[highlighted].value)
        : list.open(),
    Escape: list.close,
    Tab: () => list.setIsOpen(false),
  };
}

/** Keys that move in the list only while the field is not being typed in, where they would move the cursor. */
function pickingKeyActions(
  list: ListControls,
  letter: (direction: 1 | -1) => void,
): Record<string, () => void> {
  const { isOpen, matches, setHighlighted } = list;
  const when = (act: () => void) => () => (isOpen ? act() : list.open());
  return {
    Home: when(() => setHighlighted(0)),
    End: when(() => setHighlighted(clamp(matches.length - 1, matches.length))),
    ArrowRight: when(() => letter(1)),
    ArrowLeft: when(() => letter(-1)),
  };
}

export function useCombobox(
  options: SelectOption[],
  value: string,
  onChange: (value: string) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typing, setTyping] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const matches = matchingOptions(options, searchTerm);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm("");
    setTyping(false);
  }, []);
  const open = () => {
    if (isOpen) return;
    setIsOpen(true);
    setHighlighted(
      Math.max(
        0,
        matches.findIndex((o) => o.value === value),
      ),
    );
  };
  const select = (next: string) => {
    onChange(next);
    close();
    setHighlighted(0);
  };
  const search = (term: string) => {
    setSearchTerm(term);
    setIsOpen(true);
    setHighlighted(0);
  };
  /** Switches the field to a text field the person types in (and so raises an on-screen keyboard, which is asked for). */
  const startTyping = () => {
    setTyping(true);
    setIsOpen(true);
  };
  const jumpLetter = (direction: 1 | -1) =>
    setHighlighted((i) => neighbourLetterIndex(matches, i, direction));

  /** A letter typed in the closed field or the open list finds the option that starts with it, without filtering. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    const text =
      now - typed.current.at > TYPE_AHEAD_MS ? key : typed.current.text + key;
    typed.current = { text, at: now };
    if (!isOpen) setIsOpen(true);
    const found = typeAheadIndex(matches, text, highlighted);
    if (found >= 0) setHighlighted(found);
  };

  useBackHandler(isOpen, close);
  const list = { isOpen, matches, highlighted, setHighlighted };
  const controls = { ...list, setIsOpen, open, close, select };
  const keys = keyActions(controls);
  const picking = pickingKeyActions(controls, jumpLetter);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (!typing) {
      const inWord = typed.current.text !== "" && key === " ";
      const letter = key.length === 1 && (key !== " " || inWord);
      if (letter && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        typeAhead(key);
        return;
      }
      if (key === " ") {
        event.preventDefault();
        keys.Enter();
        return;
      }
      if (Object.hasOwn(picking, key)) {
        event.preventDefault();
        picking[key]();
        return;
      }
    }
    if (!Object.hasOwn(keys, key)) return;
    if (MOVES_IN_LIST.has(key)) event.preventDefault();
    keys[key]();
  };

  return {
    ...list,
    searchTerm,
    typing,
    /** The highlighted option, while the list is open. */
    active: isOpen ? matches[highlighted] : undefined,
    open,
    close,
    select,
    search,
    startTyping,
    jumpLetter,
    onKeyDown,
  };
}
