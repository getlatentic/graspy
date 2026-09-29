import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { PAGE } from "@/features/landing/constants";
import { SiteFooter } from "@/features/landing/components/site-chrome";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "../privacy-content";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <title>Privacy policy — graspy</title>
      <header className={cn(PAGE, "flex h-16 items-center")}>
        <Link to="/" aria-label="graspy home">
          <Logo />
        </Link>
      </header>
      <main className={cn(PAGE, "max-w-3xl pb-16")}>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-muted">Updated {PRIVACY_UPDATED}</p>
        {PRIVACY_SECTIONS.map(({ title, body }) => (
          <section key={title} className="mt-10">
            <h2 className="font-sans text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <div className="mt-3 space-y-3 leading-7 text-muted [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-5">
              {body}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
