import {
  useCallback,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { matchingOptions, type SelectOption } from "../lib/select-options";

const MOVES_IN_LIST = new Set(["ArrowDown", "ArrowUp", "Enter"]);

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

function keyActions(list: ListControls): Record<string, () => void> {
  const { isOpen, matches, highlighted, setHighlighted } = list;
  return {
    ArrowDown: () =>
      isOpen
        ? setHighlighted((i) => (i < matches.length - 1 ? i + 1 : i))
        : list.open(),
    ArrowUp: () => setHighlighted((i) => (i > 0 ? i - 1 : i)),
    Enter: () =>
      isOpen && matches[highlighted]
        ? list.select(matches[highlighted].value)
        : list.open(),
    Escape: list.close,
    Tab: () => list.setIsOpen(false),
  };
}

export function useCombobox(
  options: SelectOption[],
  value: string,
  onChange: (value: string) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const matches = matchingOptions(options, searchTerm);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm("");
  }, []);
  const open = () => {
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
  const list = { isOpen, matches, highlighted, setHighlighted };
  const keys = keyActions({ ...list, setIsOpen, open, close, select });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!Object.hasOwn(keys, event.key)) return;
    if (MOVES_IN_LIST.has(event.key)) event.preventDefault();
    keys[event.key]();
  };

  return {
    ...list,
    searchTerm,
    /** The highlighted option, while the list is open. */
    active: isOpen ? matches[highlighted] : undefined,
    open,
    close,
    select,
    search,
    onKeyDown,
  };
}
