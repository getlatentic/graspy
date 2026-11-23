import { Search } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useI18n } from "@/lib/i18n-context";
import { useButtonMode } from "../hooks/use-button-mode";
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

function inputClass(disabled: boolean, typing: boolean, button: boolean) {
  const ground = disabled
    ? "bg-track text-muted placeholder:text-muted"
    : "bg-surface";
  const caret = typing ? "" : "caret-transparent select-none";
  const room = button ? "pe-24" : "pe-12";
  return `w-full truncate ${room} placeholder:text-muted ${ground} ${caret} ${FIELD}`;
}

/**
 * On a desktop (a mouse and a keyboard) this is a text field that filters. On a
 * TV or a touch screen a closed select looks and acts like a button that opens
 * a list, not a text field: it is read-only with no text keyboard
 * (`inputMode="none"`), so the list shows at once, and no caret blinks in it.
 * There, letters typed on a hardware keyboard jump to the option that starts
 * with them, and the Search button (or "/") turns the field into a text field
 * that filters, with the on-screen keyboard asked for.
 */
export default function SearchableSelect(props: SearchableSelectProps) {
  const { id, label, value, options, disabled = false } = props;
  const { t } = useI18n();
  const buttonMode = useButtonMode();
  const combobox = useCombobox(options, value, props.onChange, buttonMode);
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
    if (buttonMode && !typing && event.key === SEARCH_KEY) {
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
          inputMode={buttonMode ? (typing ? "search" : "none") : undefined}
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
          aria-keyshortcuts={buttonMode && !typing ? SEARCH_KEY : undefined}
          aria-activedescendant={active && `${id}-option-${active.value}`}
          className={inputClass(disabled, typing, buttonMode)}
          autoComplete="off"
        />
        {buttonMode && !typing && !disabled && (
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
