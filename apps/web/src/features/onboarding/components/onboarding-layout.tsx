import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/lib/i18n-context";

/**
 * Onboarding's page. From lg it is two halves that fill the viewport with no
 * page scroll, on the one gradient: the logo and the headline on the left, and
 * on the right the form in three parts, the title and progress above, the
 * fields in the middle (the only part that scrolls, when it must), and the
 * action below. Under lg it is one column: the logo, then the form with its
 * action row stuck to the foot of the screen, and the page scrolls.
 */
export default function OnboardingLayout({
  header,
  footer,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="art-ground theme-light relative min-h-dvh overflow-clip text-on-art lg:h-dvh lg:overflow-hidden">
      <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:h-dvh lg:grid-cols-2 lg:grid-rows-1">
        <aside className="flex flex-col px-4 pt-8 sm:px-6 lg:px-12 lg:pt-11 xl:px-24 3xl:px-32 3xl:pt-14 4xl:px-44 4xl:pt-20 5xl:px-64 5xl:pt-28">
          <Link
            to="/"
            aria-label={t("onboarding.home")}
            className="self-start py-2"
          >
            <Logo />
          </Link>
          <Headline />
        </aside>

        <main className="flex min-h-0 flex-col px-4 pt-6 sm:px-6 lg:justify-center lg:px-12 lg:py-12 xl:pr-24 xl:pl-8 3xl:py-20 3xl:pr-32 4xl:pr-44 5xl:pr-64">
          <div className="zoom mx-auto flex w-full max-w-lg flex-1 flex-col sm:my-auto sm:flex-none md:max-w-xl lg:min-h-0 lg:flex-initial lg:max-w-lg">
            {header ? <div className="shrink-0">{header}</div> : null}
            <div className="mt-8 lg:-mx-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-2 lg:py-2">
              {children}
            </div>
            {footer}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Only where there is a left half to put it in: a phone's screen keeps to the form. */
function Headline() {
  const { t } = useI18n();
  return (
    <div className="zoom hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:pb-16">
      <h2 className="text-balance text-5xl leading-tight font-bold tracking-tight text-ink xl:text-6xl">
        {t("onboarding.headline")}
      </h2>
      <p className="mt-5 text-lg text-muted xl:text-xl">
        {t("onboarding.subline")}
      </p>
    </div>
  );
}
