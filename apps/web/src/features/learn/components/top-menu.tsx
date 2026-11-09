import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/lib/i18n-context";

export default function TopMenu() {
  const { t } = useI18n();

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/app/learn"
          aria-label={t("menu.tagline")}
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo />
        </Link>
      </div>
    </header>
  );
}
