import { useLocation } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { rememberChat } from "@/lib/account/chat-return";
import { cn } from "@/lib/cn";
import { useSignInOffered } from "../hooks/use-sign-in-offered";
import { SignInLink } from "./sign-in-link";

/** Sign in, from wherever the visitor is: a chat or a lesson is where they come back to. */
export function SignInHere({ className }: { className?: string }) {
  const { pathname, search } = useLocation();
  return (
    <SignInLink
      className={className}
      onClick={() => rememberChat(`${pathname}${search}`)}
    />
  );
}

/** A way to sign in at a moment it pays off, for someone who has not: the words that say why, if
 * any, and the button. Nothing is blocked by it, and nothing shows once signed in. */
export function SignInNudge({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  if (!useSignInOffered()) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-accent-soft px-4 py-3 text-sm text-ink",
        className,
      )}
    >
      {message && (
        <span dir="auto" className="min-w-0 flex-1">
          {message}
        </span>
      )}
      <SignInHere className={buttonStyles("secondary", "sm")} />
    </div>
  );
}
