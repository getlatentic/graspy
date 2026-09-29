import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { SignInLink } from "@/features/account/components/sign-in-link";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL, PAGE, contactHref } from "../constants";
import { StartLearning } from "./start-learning";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur">
      <div className={cn(PAGE, "flex h-16 items-center justify-between gap-4")}>
        <Link to="/" aria-label="graspy home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <a
            href="#how-it-works"
            className="hidden text-muted hover:text-ink md:inline"
          >
            How it works
          </a>
          <a
            href={contactHref()}
            className="hidden text-muted hover:text-ink sm:inline"
          >
            Contact
          </a>
          <SignInLink />
          <StartLearning size="sm" className="hidden sm:inline-flex" />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={cn(PAGE, "pb-10")}>
      <div className="flex flex-col gap-3 border-t border-line pt-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} graspy</span>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="py-1 hover:text-ink">
            Privacy
          </Link>
          <a href={contactHref()} className="py-1 hover:text-ink">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
