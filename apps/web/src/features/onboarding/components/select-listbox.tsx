import {
  Check,
  ChevronsDown,
  ChevronsUp,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n-context";
import { useAnchoredStyle, usePressOutside } from "../hooks/use-anchored-list";
import type { useCombobox } from "../hooks/use-combobox";
import {
  groupOptions,
  type GroupedOptions,
  type SelectOption,
} from "../lib/select-options";

type Combobox = ReturnType<typeof useCombobox>;

interface SelectListboxProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  combobox: Combobox;
  /** Turns the field into one the person types in. */
  onSearch: () => void;
  anchor: RefObject<HTMLInputElement | null>;
  /** A press inside it does not close the list. */
  container: RefObject<HTMLDivElement | null>;
}

/** Portalled to the body so no scrolling parent clips it. */
export default function SelectListbox(props: SelectListboxProps) {
  const { id, value, combobox } = props;
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const style = useAnchoredStyle(props.anchor, [props.options, value]);
  usePressOutside(combobox.close, props.container, listRef);
  const movedByPointer = useRef(false);
  const activeId = combobox.active && `${id}-option-${combobox.active.value}`;

  // Only the keyboard scrolls the list; a hover must not shift it under the pointer.
  useEffect(() => {
    if (movedByPointer.current) {
      movedByPointer.current = false;
      return;
    }
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const list = (
    <div
      ref={listRef}
      style={{ position: "fixed", top: 0, left: 0, ...style, zIndex: 9999 }}
      className="art-popup theme-light"
    >
      <div className="overflow-hidden rounded-control border-2 border-line bg-surface shadow-lift">
        {!combobox.typing && (
          <Toolbar combobox={combobox} onSearch={props.onSearch} />
        )}
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={props.label}
          className="pick-scroll max-h-96 w-full scroll-pt-9 overflow-y-auto"
        >
          {combobox.matches.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">
              {t("onboarding.profile.noResults")}
            </div>
          ) : (
            groupOptions(combobox.matches).map(({ heading, members }) => (
              <OptionGroup
                key={heading ?? "default"}
                id={id}
                heading={heading}
                members={members}
                value={value}
                combobox={combobox}
                onHover={() => {
                  movedByPointer.current = true;
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(list, document.body);
}

function OptionGroup({
  id,
  heading,
  members,
  value,
  combobox,
  onHover,
}: GroupedOptions & {
  id: string;
  value: string;
  combobox: Combobox;
  onHover: () => void;
}) {
  return (
    <div>
      {heading && (
        <div className="sticky top-0 z-10 bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {heading}
        </div>
      )}
      {members.map(({ option, index }) => (
        <ListOption
          key={option.value}
          id={`${id}-option-${option.value}`}
          option={option}
          selected={option.value === value}
          highlighted={index === combobox.highlighted}
          onHighlight={() => {
            if (index !== combobox.highlighted) onHover();
            combobox.setHighlighted(index);
          }}
          onSelect={() => combobox.select(option.value)}
        />
      ))}
    </div>
  );
}

function ListOption({
  id,
  option,
  selected,
  highlighted,
  onHighlight,
  onSelect,
}: {
  id: string;
  option: SelectOption;
  selected: boolean;
  highlighted: boolean;
  onHighlight: () => void;
  onSelect: () => void;
}) {
  const ground = selected
    ? "bg-accent-soft"
    : highlighted
      ? "bg-raised"
      : "bg-surface";
  const text = selected ? "font-medium text-accent-ink" : "text-ink";
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`min-h-12 w-full px-4 py-2 text-start transition-colors flex items-center justify-between ${ground} ${text}`}
      onMouseEnter={onHighlight}
    >
      <span>{option.label}</span>
      {selected && (
        <Check className="size-5 text-accent-ink" aria-hidden="true" />
      )}
    </button>
  );
}

/** A list shorter than this is short enough to read through, with no letter steps. */
const LETTER_STEPS_FROM = 12;

/**
 * Above the list: Search (turns the field into a text field) and the two
 * letter steps, which are the way back after a missed scroll. A press must not
 * take focus from the field, which the arrow keys and the remote act on.
 */
function Toolbar({
  combobox,
  onSearch,
}: {
  combobox: Combobox;
  onSearch: () => void;
}) {
  const { t } = useI18n();
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  const many = combobox.matches.length > LETTER_STEPS_FROM;
  return (
    <div className="flex items-center gap-2 border-b-2 border-line p-2">
      <ToolButton onClick={onSearch} onMouseDown={keepFocus} icon={Search}>
        {t("onboarding.profile.search")}
      </ToolButton>
      {many && (
        <>
          <ToolButton
            onClick={() => combobox.jumpLetter(-1)}
            onMouseDown={keepFocus}
            icon={ChevronsUp}
            label={t("onboarding.profile.previousLetter")}
          />
          <ToolButton
            onClick={() => combobox.jumpLetter(1)}
            onMouseDown={keepFocus}
            icon={ChevronsDown}
            label={t("onboarding.profile.nextLetter")}
          />
        </>
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  children,
  ...rest
}: {
  icon: LucideIcon;
  /** Names an icon-only button. */
  label?: string;
  children?: ReactNode;
  onClick: () => void;
  onMouseDown: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className="flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-control bg-raised px-3 text-sm font-semibold text-ink"
      {...rest}
    >
      <Icon className="size-5" aria-hidden="true" />
      {children}
    </button>
  );
}
