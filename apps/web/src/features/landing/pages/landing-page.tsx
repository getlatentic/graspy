import "@fontsource/inter/latin-700.css";
import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { hasCompletedOnboarding } from "@/lib/user-storage";
import { useI18n } from "@/lib/i18n-context";
import { rememberStart, type StartIntent } from "@/lib/start-intent";
import { AppTabBar } from "@/features/learn/components/app-tab-bar";
import { TrySomethingNew } from "@/features/learn/components/try-something-new";
import { Hero } from "../components/hero";
import { HowItWorks } from "../components/how-it-works";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { StartLearning } from "../components/start-learning";
import { StartingSubjectTiles } from "../components/starting-subject-tiles";
import { StrengthTiles } from "../components/strength-tiles";
import { PAGE, contactHref } from "../constants";

export default function LandingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (hasCompletedOnboarding()) return <Navigate to="/app/learn" replace />;

  // Setup comes first; what the visitor chose is kept for after it.
  const start = (intent: StartIntent) => {
    rememberStart(intent);
    navigate("/app");
  };

  return (
    // pb-20 ends the page above the tab bar fixed over a phone's screen.
    <div className="min-h-dvh bg-surface pb-20 text-ink lg:pb-0">
      <SiteHeader />
      <main>
        <Hero />
        <Shelf
          title="Pick a subject"
          more={
            <button
              type="button"
              onClick={() => start({})}
              className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-ink hover:underline"
            >
              See all
              <ChevronRight
                className="size-4 rtl:rotate-180"
                aria-hidden="true"
              />
            </button>
          }
        >
          <StartingSubjectTiles onPick={(subject) => start({ subject })} />
        </Shelf>
        <Shelf title={t("home.tryTitle")}>
          <TrySomethingNew onPick={(ask) => start({ ask })} />
        </Shelf>
        <Block id="how-it-works" title="How it works">
          <HowItWorks />
        </Block>
        <Block title="Why graspy">
          <StrengthTiles />
        </Block>
        <ClosingCall />
      </main>
      <SiteFooter />
      <AppTabBar
        className="fixed inset-x-0 bottom-0 z-20"
        home={{ path: "/", current: "home" }}
      />
    </div>
  );
}

function Shelf({
  title,
  more,
  children,
}: {
  title: string;
  more?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(PAGE, "pb-10 lg:pb-16")}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {more}
      </div>
      {children}
    </section>
  );
}

function Block({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(PAGE, "scroll-mt-16 pb-20 lg:pb-28")}>
      <h2 className="font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function ClosingCall() {
  return (
    <section className={cn(PAGE, "pb-20 lg:pb-28")}>
      <div className="flex flex-col items-start gap-6 rounded-3xl bg-accent-soft px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <h2 className="text-balance font-sans text-2xl font-semibold tracking-tight">
            Try your first lesson.
          </h2>
          <p className="mt-2 leading-7 text-muted">
            Bringing graspy to a school or programme?{" "}
            <a
              href={contactHref("Schools and programmes")}
              className="font-medium text-accent-ink underline underline-offset-4"
            >
              Talk to us
            </a>
            .
          </p>
        </div>
        <StartLearning />
      </div>
    </section>
  );
}
