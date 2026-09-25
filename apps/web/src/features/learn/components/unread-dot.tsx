import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

export function UnreadDot({ className }: { className: string }) {
  const { t } = useI18n();
  return (
    <span className={cn("rounded-full bg-danger", className)}>
      <span className="sr-only">{t("chat.newTutorMessage")}</span>
    </span>
  );
}
