import { useI18n } from "@/lib/i18n-context";

export const FIELD =
  "rounded-control border-2 border-line bg-surface px-4 py-3 text-base font-medium text-ink transition focus:border-accent focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-track";
export const LABEL = "mb-2 block text-sm font-semibold text-ink";

export function FieldError({ message }: { message?: string }) {
  const { t } = useI18n();
  return message ? (
    <p className="mt-2 text-sm text-danger">{t(message)}</p>
  ) : null;
}
