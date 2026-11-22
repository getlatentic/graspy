import { Check } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
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
    <div ref={listRef} style={{ ...style, zIndex: 9999 }}>
      <div
        id={`${id}-listbox`}
        role="listbox"
        aria-label={props.label}
        className="max-h-96 w-full scroll-pt-9 overflow-auto rounded-control border-2 border-line bg-surface shadow-lift"
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
      className={`w-full px-4 py-2 text-start transition-colors flex items-center justify-between ${ground} ${text}`}
      onMouseEnter={onHighlight}
    >
      <span>{option.label}</span>
      {selected && (
        <Check className="h-4 w-4 text-accent-ink" aria-hidden="true" />
      )}
    </button>
  );
}
