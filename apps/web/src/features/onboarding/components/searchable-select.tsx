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

function inputClass(disabled: boolean): string {
  const ground = disabled
    ? "bg-track cursor-not-allowed text-muted placeholder:text-muted"
    : "bg-white";
  return `w-full px-4 py-3 border border-accent-line rounded-2xl focus:border-accent focus:ring-2 focus:ring-accent focus:ring-offset-0 text-base text-ink placeholder:text-muted shadow-sm transition ${ground} ${FIELD}`;
}

export default function SearchableSelect(props: SearchableSelectProps) {
  const { id, label, value, options, disabled = false } = props;
  const combobox = useCombobox(options, value, props.onChange);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const { active, isOpen } = combobox;

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
          value={isOpen ? combobox.searchTerm : selectedLabel}
          onChange={(event) => combobox.search(event.target.value)}
          onFocus={combobox.open}
          onKeyDown={combobox.onKeyDown}
          placeholder={props.placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={active && `${id}-option-${active.value}`}
          className={inputClass(disabled)}
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
        className={`w-5 h-5 text-muted transition-transform ${
          open ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
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
