import { Search } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useI18n } from "@/lib/i18n-context";
import { SEARCH_KEY, useCombobox } from "../hooks/use-combobox";
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

function inputClass(disabled: boolean, typing: boolean) {
  const ground = disabled
    ? "bg-track text-muted placeholder:text-muted"
    : "bg-surface";
  const caret = typing ? "" : "caret-transparent select-none";
  const room = typing ? "pe-12" : "pe-24";
  return `w-full truncate ${room} placeholder:text-muted ${ground} ${caret} ${FIELD}`;
}

/**
 * A select acts like a native one on every device, with no device or
 * pointer test (a TV's browser can pass for a desktop's): a closed field is
 * read-only with no text keyboard (`inputMode="none"`), so the list shows at
 * once and no caret blinks in it. Letters typed on a hardware keyboard jump to
 * the option that starts with them (several in a row make a prefix); the
 * Search button, which is in the tab order, or the "/" key makes the field a
 * text field that filters, and only then is the on-screen keyboard asked for.
 */
export default function SearchableSelect(props: SearchableSelectProps) {
  const { id, label, value, options, disabled = false } = props;
  const { t } = useI18n();
  const combobox = useCombobox(options, value, props.onChange);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const { active, isOpen, typing } = combobox;

  // The field must be editable before it is focused again, inside the same
  // press, or the browser does not raise the on-screen keyboard.
  const startTyping = () => {
    flushSync(() => combobox.startTyping());
    inputRef.current?.blur();
    inputRef.current?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!typing && event.key === SEARCH_KEY) {
      event.preventDefault();
      startTyping();
      return;
    }
    combobox.onKeyDown(event);
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
          onKeyDown={onKeyDown}
          placeholder={props.placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          aria-autocomplete={typing ? "list" : "none"}
          aria-keyshortcuts={typing ? undefined : SEARCH_KEY}
          aria-activedescendant={active && `${id}-option-${active.value}`}
          className={inputClass(disabled, typing)}
          autoComplete="off"
        />
        {!typing && !disabled && (
          <button
            type="button"
            onClick={startTyping}
            aria-label={t("onboarding.profile.search")}
            className="absolute end-12 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-control text-muted"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        )}
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
