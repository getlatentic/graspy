import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { contactHref } from "@/features/landing/constants";
import { Logo } from "@/components/brand/logo";
import { Art } from "@/components/brand/art";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. */
export default function SignInPage() {
  const { t } = useI18n();
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <main className="grid min-h-dvh grid-cols-1 grid-rows-[auto_1fr] bg-canvas lg:grid-cols-2 lg:grid-rows-1">
      <div className="aspect-4/3 max-h-96 min-w-0 overflow-hidden sm:aspect-video lg:relative lg:aspect-auto lg:max-h-none">
        <Art
          name="tablet"
          eager
          className="object-top lg:absolute lg:inset-0"
        />
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center gap-10 px-5 py-10 sm:px-10">
        <Logo />
        <div className="w-full max-w-sm">
          <SignIn />
        </div>
        <a
          href={contactHref()}
          className="text-sm font-medium text-muted hover:text-ink"
        >
          {t("onboarding.contact")}
        </a>
      </div>
    </main>
  );
}

export function SignIn() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance text-center font-display text-4xl font-bold text-ink">
        {t("signIn.title")}
      </h1>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton
          variant="primary"
          size="lg"
          className="w-full whitespace-nowrap px-3 text-sm sm:px-6 sm:text-base"
        />
      </div>
      <p className="border-t border-line pt-5 text-center text-sm text-muted">
        <span className="whitespace-nowrap">{t("signIn.newHere")}</span>{" "}
        <Link
          to="/app"
          className="whitespace-nowrap font-semibold text-accent-ink hover:underline"
        >
          {t("signIn.start")}
        </Link>
      </p>
    </div>
  );
}
