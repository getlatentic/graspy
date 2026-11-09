import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL, PAGE, contactHref } from "@/features/landing/constants";
import { SiteFooter } from "@/features/landing/components/site-chrome";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";

export const DELETE_REQUEST = contactHref("Delete my account");

/** How to have an account deleted, public so that someone who cannot sign in can read it. */
export default function DeleteAccountPage() {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <title>Delete your account — graspy</title>
      <header className={cn(PAGE, "flex h-16 items-center")}>
        <Link to="/" aria-label="graspy home">
          <Logo />
        </Link>
      </header>
      <main className={cn(PAGE, "max-w-3xl pb-16")}>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Delete your account
        </h1>
        <section className="mt-10">
          <h2 className="font-sans text-xl font-semibold tracking-tight">
            If you can sign in
          </h2>
          <p className="mt-3 leading-7 text-muted">
            Open{" "}
            <Link
              to={LEARNERS_PAGE}
              className="font-medium text-accent-ink underline underline-offset-4"
            >
              Learners
            </Link>{" "}
            and choose <strong className="text-ink">Delete account</strong>.
            Every learner, everything graspy kept for them, and the Google
            sign-in record graspy holds (its email and name) are deleted at
            once.
          </p>
        </section>
        <section className="mt-10">
          <h2 className="font-sans text-xl font-semibold tracking-tight">
            If you can&rsquo;t
          </h2>
          <p className="mt-3 leading-7 text-muted">
            Email{" "}
            <a
              href={DELETE_REQUEST}
              className="font-medium text-accent-ink underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            from the address you signed in with, or give us that address. We
            reply there to check the account is yours, then delete it.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
