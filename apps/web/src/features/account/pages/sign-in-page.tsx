import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { Art } from "@/components/brand/art";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/button-styles";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. One look for every age: the class is not known yet. */
export default function SignInPage() {
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-x-hidden bg-art-sky px-5 py-8 text-on-art sm:px-10 lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto_1fr] lg:gap-x-12 lg:gap-y-0 lg:px-20">
      <Shapes />
      <img
        src="/brand/logo-lockup.webp"
        alt="graspy"
        width={640}
        height={136}
        className="h-12 w-auto lg:absolute lg:start-20 lg:top-16"
      />
      <Art
        name="tablet"
        eager
        className="max-h-[32dvh] max-w-80 object-contain object-bottom lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[64dvh] lg:max-w-xl lg:self-center lg:justify-self-center"
      />
      <div className="w-full max-w-sm lg:col-start-1 lg:row-start-2 lg:max-w-lg">
        <SignIn />
      </div>
    </main>
  );
}

/** Soft shapes behind everything: a wave along the foot, and from lg a blob in each top corner. */
function Shapes() {
  return (
    <>
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
      <span
        aria-hidden="true"
        className="absolute -start-24 -top-28 -z-10 hidden size-80 rounded-full bg-art-wave/40 lg:block"
      />
      <span
        aria-hidden="true"
        className="absolute -end-20 top-10 -z-10 hidden h-48 w-96 rounded-full bg-art-wave/50 lg:block"
      />
    </>
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
        <p className="text-pretty">{t("signIn.explain")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton
          variant="primary"
          size="lg"
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
