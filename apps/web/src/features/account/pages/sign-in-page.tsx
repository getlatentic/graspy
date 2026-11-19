import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { contactHref } from "@/features/landing/constants";
import { Logo } from "@/components/brand/logo";
import { Art } from "@/components/brand/art";
import { Backdrop } from "@/components/brand/backdrop";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. */
export default function SignInPage() {
  const { t } = useI18n();
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-center overflow-x-hidden bg-art-ground text-on-art lg:grid lg:grid-cols-2">
      <Backdrop />
      <div className="flex min-h-0 items-end justify-center px-6 pt-6 lg:px-12 lg:pb-6 lg:pt-12">
        <Art
          name="tablet"
          eager
          className="max-h-[34dvh] max-w-md object-contain object-bottom lg:max-h-full lg:max-w-xl"
        />
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center gap-6 px-5 py-6 sm:px-10 lg:gap-8 lg:py-10">
        <span className="brightness-50">
          <Logo />
        </span>
        <div className="w-full max-w-sm">
          <SignIn />
        </div>
        <a
          href={contactHref()}
          className="text-sm font-semibold hover:underline"
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
      <h1 className="text-balance text-center font-display text-3xl font-bold lg:text-4xl">
        {t("signIn.title")}
      </h1>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton
          variant="primary"
          size="lg"
          className="w-full whitespace-nowrap px-3 text-sm sm:px-6 sm:text-base"
        />
      </div>
      <p className="border-t border-on-art/15 pt-5 text-center text-sm">
        <span className="whitespace-nowrap">{t("signIn.newHere")}</span>{" "}
        <Link
          to="/app"
          className="whitespace-nowrap font-semibold underline hover:no-underline"
        >
          {t("signIn.start")}
        </Link>
      </p>
    </div>
  );
}
