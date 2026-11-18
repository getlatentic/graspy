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
    <main className="flex min-h-dvh flex-col bg-art-ground lg:grid lg:grid-cols-2">
      <div className="relative min-h-72 min-w-0 flex-1 overflow-hidden lg:flex-none">
        <Art
          name="tablet"
          eager
          className="fade-edge absolute inset-0 object-top"
        />
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center gap-8 px-5 pb-10 -mt-4 lg:mt-0 lg:py-10 sm:px-10">
        <span className="brightness-50">
          <Logo />
        </span>
        <div className="w-full max-w-sm">
          <SignIn />
        </div>
        <a
          href={contactHref()}
          className="text-sm font-semibold text-ink hover:underline"
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
      <p className="border-t border-ink/15 pt-5 text-center text-sm text-ink">
        <span className="whitespace-nowrap">{t("signIn.newHere")}</span>{" "}
        <Link
          to="/app"
          className="whitespace-nowrap font-semibold text-ink underline hover:no-underline"
        >
          {t("signIn.start")}
        </Link>
      </p>
    </div>
  );
}
