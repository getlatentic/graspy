import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { contactHref } from "@/features/landing/constants";
import { Art } from "@/components/brand/art";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/button-styles";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. One look for every age: the class is not known yet. */
export default function SignInPage() {
  const { t } = useI18n();
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-x-hidden bg-art-sky px-5 py-8 text-on-art sm:px-10 lg:grid lg:grid-cols-2 lg:gap-0 lg:px-12">
      <Wave />
      <div className="flex flex-col items-center gap-6 lg:items-center lg:pe-12">
        <img
          src="/brand/logo-lockup.webp"
          alt="graspy"
          width={640}
          height={136}
          className="h-12 w-auto"
        />
        <Art
          name="tablet"
          eager
          className="max-h-[32dvh] max-w-80 object-contain object-bottom lg:max-h-[50dvh] lg:max-w-md"
        />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-6 lg:items-start lg:ps-12">
        <SignIn />
        <a
          href={contactHref()}
          className="text-sm font-semibold underline hover:no-underline"
        >
          {t("onboarding.contact")}
        </a>
      </div>
    </main>
  );
}

/** A soft wave along the foot of the screen, behind everything. */
function Wave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 200"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 -z-10 h-24 w-full text-art-wave lg:h-40"
    >
      <path
        fill="currentColor"
        fillOpacity="0.6"
        d="M0 120C240 40 480 40 720 100s480 80 720-20v120H0z"
      />
    </svg>
  );
}

export function SignIn() {
  const { t } = useI18n();
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2 text-center lg:text-start">
        <h1 className="text-balance font-display text-3xl font-semibold lg:text-4xl">
          {t("signIn.ready")}
        </h1>
        <p className="text-pretty">{t("signIn.explain")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton
          variant="primary"
          size="lg"
          className="w-full whitespace-nowrap px-3 text-base sm:px-6"
        />
        <Link
          to="/app"
          className={cn(
            buttonStyles("secondary", "lg"),
            "w-full whitespace-nowrap border-2 border-accent bg-transparent px-3 text-base sm:px-6",
          )}
        >
          {t("signIn.start")}
        </Link>
      </div>
    </div>
  );
}
