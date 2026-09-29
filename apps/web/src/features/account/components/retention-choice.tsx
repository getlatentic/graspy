import {
  RETENTION_DAYS,
  type RetentionDays,
} from "@/lib/account/consent-notices";
import { useI18n } from "@/lib/i18n-context";

/** How long graspy keeps the recordings: 30, 90 or 365 days. */
export function RetentionChoice({
  days,
  onChange,
}: {
  days: RetentionDays;
  onChange: (days: RetentionDays) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-ink">
        {t("voiceRecordings.keepFor")}
      </legend>
      <div className="flex flex-wrap gap-2">
        {RETENTION_DAYS.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="radio"
              name="retention-days"
              value={option}
              checked={days === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span className="inline-flex rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {t("voiceRecordings.days", { days: option })}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
