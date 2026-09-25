import { useI18n } from "@/lib/i18n-context";

export const FIELD =
  "rounded-2xl border border-accent-line bg-white px-5 py-4 text-base font-medium text-ink shadow-lg shadow-accent/10 transition focus:border-accent focus:ring-0 disabled:bg-track";
export const LABEL = "mb-2 block text-sm font-semibold text-ink";

export function FieldError({ message }: { message?: string }) {
  const { t } = useI18n();
  return message ? (
    <p className="mt-2 text-sm text-danger">{t(message)}</p>
  ) : null;
}
