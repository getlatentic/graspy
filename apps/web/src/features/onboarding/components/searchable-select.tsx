import { useRef } from "react";
import { useCombobox } from "../hooks/use-combobox";
import type { SelectOption } from "../lib/select-options";
import SelectListbox from "./select-listbox";
import { FIELD, LABEL } from "./steps/field-parts";

interface SearchableSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
}

function inputClass(disabled: boolean, typing: boolean): string {
  const ground = disabled
    ? "bg-track text-muted placeholder:text-muted"
    : "bg-surface";
  const caret = typing ? "" : "caret-transparent select-none";
  return `w-full truncate pe-12 placeholder:text-muted ${ground} ${caret} ${FIELD}`;
}

/**
 * A closed select looks and acts like a button that opens a list, not a text
 * field: it is read-only with no text keyboard (`inputMode="none"`), so a TV or
 * a phone shows the list at once, and no caret blinks in it. Letters typed on a
 * hardware keyboard jump to the option that starts with them; the list's
 * Search button turns the field into a text field that filters, and asks for
 * the on-screen keyboard.
 */
export default function SearchableSelect(props: SearchableSelectProps) {
  const { id, label, value, options, disabled = false } = props;
  const combobox = useCombobox(options, value, props.onChange);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const { active, isOpen, typing } = combobox;
  const startTyping = () => {
    combobox.startTyping();
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={typing && isOpen ? combobox.searchTerm : selectedLabel}
          readOnly={!typing}
          inputMode={typing ? "search" : "none"}
          onChange={(event) => combobox.search(event.target.value)}
          onFocus={combobox.open}
          onClick={combobox.open}
          onKeyDown={combobox.onKeyDown}
          placeholder={props.placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={active && `${id}-option-${active.value}`}
          className={inputClass(disabled, typing)}
          autoComplete="off"
        />
        <OpenArrow open={isOpen} />
      </div>
      {isOpen && !disabled && (
        <SelectListbox
          id={id}
          label={label}
          value={value}
          options={options}
          combobox={combobox}
          onSearch={startTyping}
          anchor={inputRef}
          container={containerRef}
        />
      )}
    </div>
  );
}

function OpenArrow({ open }: { open: boolean }) {
  return (
    <div className="absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none">
      <svg
        className={`size-6 text-muted transition-transform ${
          open ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  );
}
