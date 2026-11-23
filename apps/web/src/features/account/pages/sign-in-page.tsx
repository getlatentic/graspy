import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/button-styles";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. One look for every age: the class is not known yet. */
export default function SignInPage() {
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-x-hidden art-ground theme-light px-[max(1.25rem,var(--page-gutter))] py-[max(2rem,var(--page-gutter-block))] text-on-art sm:px-[max(2.5rem,var(--page-gutter))] lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto_1fr] lg:gap-x-12 lg:gap-y-0 lg:px-[max(5rem,var(--page-gutter))]">
      <div className="lg:absolute lg:start-[max(5rem,var(--page-gutter))] lg:top-[max(4rem,var(--page-gutter-block))]">
        <Logo />
      </div>
      <img
        src="/brand/art/scene-still-life.webp"
        alt=""
        width={900}
        height={1125}
        decoding="async"
        fetchPriority="high"
        className="block h-auto max-h-[32dvh] w-auto max-w-full object-contain lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[72dvh] lg:self-center lg:justify-self-center"
      />
      <div className="w-full max-w-sm lg:col-start-1 lg:row-start-2 lg:max-w-md">
        <SignIn />
      </div>
    </main>
  );
}

export function SignIn() {
  const { t } = useI18n();
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2 text-center lg:gap-3 lg:text-start">
        <h1 className="text-balance font-display text-3xl font-semibold lg:text-5xl">
          {t("signIn.ready")}
        </h1>
        <p className="text-pretty lg:text-lg">{t("signIn.explain")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton
          variant="primary"
          size="lg"
          problemClassName="text-on-art"
          className="w-full whitespace-nowrap px-3 text-base sm:px-6 lg:text-lg"
        />
        <Link
          to="/app"
          className={cn(
            buttonStyles("secondary", "lg"),
            "w-full whitespace-nowrap border-2 border-on-art bg-transparent text-on-art hover:bg-white/40 px-3 text-base sm:px-6 lg:text-lg",
          )}
        >
          {t("signIn.start")}
        </Link>
      </div>
    </div>
  );
}
