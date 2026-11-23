import { LoadingBar, SlowRetry } from "@/components/loading-screen";
import { useSlow } from "@/hooks/use-slow";
import { useI18n } from "@/lib/i18n-context";
import { pageShape } from "@/features/learn/lib/app-sections";
import { PageSkeleton } from "./page-skeleton";

/** What the page area holds while the learner's plan is read: the shape of the page, or, once the
 * server has taken a while, the one thing to do. The wait goes on behind that, so a plan that
 * arrives still shows its page. */
export function PlanWait({
  pathname,
  chat,
  onRetry,
}: {
  pathname: string;
  chat: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const slow = useSlow(true);
  let waiting = <PageSkeleton shape={pageShape(pathname)} />;
  if (chat) waiting = <LoadingBar />;
  if (slow) waiting = <SlowRetry onRetry={onRetry} />;
  return (
    <div
      aria-busy="true"
      className={
        slow || chat
          ? "flex min-h-full items-center justify-center"
          : "contents"
      }
    >
      <p role="status" className="sr-only">
        {t("loading.opening")}
      </p>
      {waiting}
    </div>
  );
}
