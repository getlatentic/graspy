import { useId, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { isAboutYou, type AboutYou } from "@/lib/content";
import { cn } from "@/shared/cn";
import { useToolResult, type Shown } from "@/shared/use-tool-result";
import type { Words } from "@/shared/words";
import { countryOptions } from "./country-names";
import { useAboutYou } from "./use-about-you";

const FIELD =
  "w-full rounded-full border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-line";
const CHIP =
  "rounded-full border-2 px-4 py-2 text-start text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default";
const LABEL = "block text-sm font-semibold text-muted";

export function DetailsView() {
  const shown = useToolResult("graspy details", (value) =>
    isAboutYou(value) ? value : null,
  );
  return shown && <Details shown={shown} />;
}

function Details({ shown }: { shown: Shown<AboutYou> }) {
  const { app, result, words, locale } = shown;
  const form = result.structuredContent;
  const about = useAboutYou(app, result._meta.viewUUID, form);
  const countries = useMemo(
    () => countryOptions(form.names, form.countries, locale),
    [form.names, form.countries, locale],
  );

  return (
    <form
      aria-label={words.details.label}
      onSubmit={(event) => {
        event.preventDefault();
        void about.submit();
      }}
      className="space-y-4 rounded-card border border-line bg-surface p-4"
    >
      <CountryField
        words={words}
        options={countries}
        value={about.country}
        disabled={about.sent}
        onChange={about.chooseCountry}
      />
      <ClassField
        words={words}
        classes={about.classes}
        value={about.className}
        disabled={about.sent}
        onChange={about.chooseClass}
      />
      {about.needsCourse && (
        <CourseField
          words={words}
          value={about.course}
          disabled={about.sent}
          onChange={about.writeCourse}
        />
      )}
      <button
        type="submit"
        disabled={!about.ready || about.sent}
        className="rounded-full border-2 border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-accent"
      >
        {words.details.continue}
      </button>
      {about.refused && (
        <p role="status" className="text-sm text-muted">
          {words.details.busy}
        </p>
      )}
    </form>
  );
}

interface CountryFieldProps {
  words: Words;
  options: { code: string; name: string }[];
  value: string;
  disabled: boolean;
  onChange: (code: string) => void;
}

/** A native select, which every device already gives type-ahead, a keyboard and a picker, styled
 * as the app's other fields are: a rounded button with a chevron. */
function CountryField({
  words,
  options,
  value,
  disabled,
  onChange,
}: CountryFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL}>
        {words.details.country}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD, "appearance-none pe-10")}
        >
          {value === "" && (
            <option value="" disabled>
              {words.details.chooseCountry}
            </option>
          )}
          {options.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}

interface ClassFieldProps {
  words: Words;
  classes: string[];
  value: string;
  disabled: boolean;
  onChange: (className: string) => void;
}

function ClassField({
  words,
  classes,
  value,
  disabled,
  onChange,
}: ClassFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <p id={id} className={LABEL}>
        {words.details.class}
      </p>
      {/* A country's classes can be many, so they scroll inside the card. */}
      <div
        role="group"
        aria-labelledby={id}
        className="flex max-h-60 flex-wrap gap-2 overflow-y-auto p-1"
      >
        {classes.map((name) => (
          <button
            key={name}
            type="button"
            dir="auto"
            disabled={disabled}
            aria-pressed={value === name}
            onClick={() => onChange(name)}
            className={cn(
              CHIP,
              value === name
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-surface text-ink hover:border-accent disabled:opacity-50 disabled:hover:border-line",
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CourseFieldProps {
  words: Words;
  value: string;
  disabled: boolean;
  onChange: (course: string) => void;
}

function CourseField({ words, value, disabled, onChange }: CourseFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL}>
        {words.details.course}
      </label>
      <input
        id={id}
        type="text"
        dir="auto"
        maxLength={60}
        value={value}
        disabled={disabled}
        placeholder={words.details.coursePlaceholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD, "placeholder:font-normal placeholder:text-muted")}
      />
    </div>
  );
}
