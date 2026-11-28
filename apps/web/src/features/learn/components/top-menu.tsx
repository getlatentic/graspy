import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button-styles";
import { SignInHere } from "@/features/account/components/sign-in-nudge";
import { useI18n } from "@/lib/i18n-context";

export default function TopMenu() {
  const { t } = useI18n();

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-[max(1rem,var(--overscan-x))] pt-[max(0.75rem,var(--overscan-y))] pb-3 sm:px-[max(1.5rem,var(--overscan-x))]">
        <Link
          to="/app/learn"
          aria-label={t("menu.tagline")}
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo />
        </Link>
        <SignInHere className={buttonStyles("secondary", "sm")} />
      </div>
    </header>
  );
}
