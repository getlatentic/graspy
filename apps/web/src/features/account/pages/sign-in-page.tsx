import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { Scene } from "@/components/brand/scene";
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
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-x-hidden art-ground px-5 py-8 text-on-art sm:px-10 lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto_1fr] lg:gap-x-12 lg:gap-y-0 lg:px-20">
      <div className="lg:absolute lg:start-20 lg:top-16">
        <Logo />
      </div>
      <Scene
        band={null}
        eager
        className="max-h-[32dvh] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[72dvh] lg:self-center lg:justify-self-center"
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
