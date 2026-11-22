import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

/**
 * Onboarding's page. In the split layout (wide and tall enough, see index.css)
 * it is two halves the height of the screen, on the one gradient: the logo and
 * the headline on the left, and on the right the form in three parts, the
 * title and progress above, the fields in the middle (the only part that
 * scrolls, when it must), and the action below, with the form's top at a fixed
 * place so the title does not move between steps. Otherwise it is one column:
 * the logo, then the form with its action row stuck to the foot of the screen,
 * and the page scrolls. `resetKey` brings the fields back to the top when the
 * step changes. Padding is logical so the halves flip for a right-to-left
 * language.
 */
export default function OnboardingLayout({
  header,
  footer,
  resetKey,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  resetKey?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const fields = useFields(resetKey);
  return (
    <div className="art-ground theme-light relative min-h-dvh overflow-clip text-on-art split:h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-20 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
      >
        {t("onboarding.skip")}
      </a>
      <div className="grid min-h-dvh grid-rows-[auto_1fr] split:h-dvh split:grid-cols-2 split:grid-rows-1">
        <aside className="flex flex-col px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-8 sm:px-6 split:px-12 split:pt-11 split:xl:px-24">
          <Link
            to="/"
            aria-label={t("onboarding.home")}
            className="self-start py-2"
          >
            <Logo />
          </Link>
          <Headline />
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-0 flex-col px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-6 outline-none sm:px-6 split:px-12 split:pt-[12dvh] split:pb-10 split:xl:ps-8 split:xl:pe-24"
        >
          <div className="zoom mx-auto flex w-full max-w-lg flex-1 flex-col sm:my-auto sm:flex-none md:max-w-xl split:my-0 split:min-h-0 split:max-w-lg split:flex-initial">
            {header ? <div className="shrink-0">{header}</div> : null}
            <div
              ref={fields.ref}
              tabIndex={fields.scrolls ? 0 : undefined}
              role={fields.scrolls ? "region" : undefined}
              aria-labelledby={fields.scrolls ? "page-title" : undefined}
              className={cn(
                "split:-mx-2 split:min-h-32 split:flex-1 split:overflow-y-auto split:px-2 split:py-2",
                header && "mt-8",
              )}
            >
              {children}
            </div>
            {footer}
          </div>
        </main>
      </div>
    </div>
  );
}

/** The scroller of the fields: back to the top on a new step, and reachable by keyboard when it scrolls. */
function useFields(resetKey: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [resetKey]);

  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const measure = () => setScrolls(box.scrollHeight > box.clientHeight + 1);
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    if (box.firstElementChild) watch.observe(box.firstElementChild);
    measure();
    return () => watch.disconnect();
  }, [resetKey]);

  return { ref, scrolls };
}

/** Only where there is a left half to put it in: a phone's screen keeps to the form. Not a heading, so each screen has one h1. */
function Headline() {
  const { t } = useI18n();
  return (
    <div className="zoom hidden split:flex split:flex-1 split:flex-col split:justify-center split:pb-16">
      <p className="text-balance text-5xl leading-tight font-bold tracking-tight text-ink xl:text-6xl">
        {t("onboarding.headline")}
      </p>
      <p className="mt-5 text-lg text-muted xl:text-xl">
        {t("onboarding.subline")}
      </p>
    </div>
  );
}
