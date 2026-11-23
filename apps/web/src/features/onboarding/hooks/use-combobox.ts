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

/** Left and Right, with the list closed, are for moving focus (a remote's pad must be able to leave the field). */
const SIDEWAYS = new Set(["ArrowLeft", "ArrowRight"]);
/** Up and Down open a closed list, as the ARIA select-only combobox does, unless focus came by an arrow key, which passes over the field (OK, Enter, Space, Alt+Up and Alt+Down open it then). */
const VERTICAL = new Set(["ArrowDown", "ArrowUp"]);

/** Turns a read-only select into a text field that filters, from a keyboard (handled by the field, which must also focus it). */
export const SEARCH_KEY = "/";

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

/** Whether the writing runs right to left where the key was pressed. */
function isRtl(element: Element): boolean {
  const dir = element.closest("[dir]")?.getAttribute("dir");
  return dir ? dir === "rtl" : getComputedStyle(element).direction === "rtl";
}

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
  rtl: boolean,
): Record<string, () => void> {
  const { isOpen, matches, setHighlighted } = list;
  const when = (act: () => void) => () => (isOpen ? act() : list.open());
  const [forward, back] = rtl
    ? (["ArrowLeft", "ArrowRight"] as const)
    : (["ArrowRight", "ArrowLeft"] as const);
  return {
    Home: when(() => setHighlighted(0)),
    End: when(() => setHighlighted(clamp(matches.length - 1, matches.length))),
    [forward]: when(() => letter(1)),
    [back]: when(() => letter(-1)),
  };
}

/**
 * A select works like a native one, on every device: read-only, letters jump
 * to the option that starts with them, and the field becomes a text field that
 * filters only after `startTyping` (the Search button or the "/" key), which
 * is what asks for an on-screen keyboard.
 */
export function useCombobox(
  options: SelectOption[],
  value: string,
  onChange: (value: string) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const arrived = useRef(false);
  const matches = matchingOptions(options, searchTerm);
  const typing = searching;

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm("");
    setSearching(false);
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
  /** Makes the field one the person types in (so an on-screen keyboard is asked for). */
  const startTyping = () => {
    setSearching(true);
    setIsOpen(true);
  };
  const jumpLetter = (direction: 1 | -1) =>
    setHighlighted((i) => neighbourLetterIndex(matches, i, direction));

  /** A letter typed in the closed field or the open list finds the option that starts with it, without filtering. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    const fresh = now - typed.current.at <= TYPE_AHEAD_MS;
    const text = fresh ? typed.current.text + key : key;
    typed.current = { text, at: now };
    if (!isOpen) setIsOpen(true);
    const found = typeAheadIndex(matches, text, highlighted);
    if (found >= 0) setHighlighted(found);
  };
  /** A space continues a word typed a moment ago; on its own it opens the list or picks. */
  const inWord = () =>
    typed.current.text !== "" && Date.now() - typed.current.at <= TYPE_AHEAD_MS;

  useBackHandler(isOpen, close);
  const list = { isOpen, matches, highlighted, setHighlighted };
  const controls = { ...list, setIsOpen, open, close, select };
  const keys = keyActions(controls);

  const onPickingKey = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    const { key } = event;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    const picking = pickingKeyActions(
      controls,
      jumpLetter,
      isRtl(event.currentTarget),
    );
    if (key.length === 1 && plain && (key !== " " || inWord())) typeAhead(key);
    else if (key === " " && plain) keys.Enter();
    else if (Object.hasOwn(picking, key)) picking[key]();
    else return false;
    event.preventDefault();
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    const leaves = SIDEWAYS.has(key) || (VERTICAL.has(key) && arrived.current);
    if (!typing && !isOpen && leaves && !event.altKey) return;
    if (!typing && onPickingKey(event)) return;
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
    /** Noted on each focus: whether an arrow key brought it. */
    noteArrival: (byArrow: boolean) => {
      arrived.current = byArrow;
    },
  };
}
