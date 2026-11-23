import { Button } from "@/components/ui/button";
import { useSlow } from "@/hooks/use-slow";
import { useI18n } from "@/lib/i18n-context";

/** The progress line of the page's first paint (index.html draws the same one), so the hand-over
 * from that page to this one moves nothing. */
export function LoadingBar() {
  return (
    <div
      aria-hidden="true"
      className="h-1 w-28 overflow-hidden rounded-pill bg-track"
    >
      <div className="h-full w-1/3 rounded-pill bg-accent motion-safe:animate-sweep motion-reduce:ml-9" />
    </div>
  );
}

/** What stands where a page will be when the server has not answered in a while: the one thing
 * to do. Its title is for the eye: the status beside it has already said it. The wait goes on behind it, so an answer that arrives still shows the page. */
export function SlowRetry({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p aria-hidden="true" className="text-lg font-semibold text-ink">
        {t("loading.opening")}
      </p>
      <Button onClick={onRetry}>{t("loading.tryAgain")}</Button>
    </div>
  );
}

/** A whole screen waiting for the app itself: the logo and a progress line, on the canvas colour
 * index.html paints first. Past SLOW_MS the line gives way to a way to try again. */
export function LoadingScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const slow = useSlow(true);
  return (
    <main className="min-h-dvh bg-canvas">
      <p role="status" className="sr-only">
        {t("loading.opening")}
      </p>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8">
        <img
          src="/brand/graspy-lockup-v1.svg"
          alt=""
          width={4552}
          height={836}
          className="block h-10 w-auto"
        />
        <div className="flex h-12 items-center">
          {slow ? (
            <Button onClick={onRetry}>{t("loading.tryAgain")}</Button>
          ) : (
            <LoadingBar />
          )}
        </div>
      </div>
    </main>
  );
}
