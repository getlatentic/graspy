import { useEffect, useLayoutEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { Logo } from "@/components/brand/logo";
import { Spinner } from "@/components/ui/spinner";
import { SignInLink } from "@/features/account/components/sign-in-link";
import { ChatView } from "@/features/learn/components/chat-view";
import { usePlan } from "@/features/learn/learner-context";
import { ChatOnlyProviders } from "@/features/learn/learner-providers";
import { scopeOf, TRY_CHAT } from "@/features/learn/lib/chat-targets";
import {
  CHAT_VIEWPORT_CLASS,
  chatViewportStyle,
} from "@/features/learn/lib/chat-viewport";
import { readyToChat } from "@/features/learn/lib/start-chat";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { holdAnonymousSession } from "@/lib/api/session";
import { rememberChat } from "@/lib/account/chat-return";
import { useAccount } from "@/lib/account/use-account";
import { cn } from "@/lib/cn";

/** Readies the device (its own profile and a plan with no subjects, as the chat adds them) and
 * loads the plan; a device that already has a class but no plan goes to the app, which makes it. */
function useReadyDevice(): void {
  const navigate = useNavigate();
  const { loadSaved } = usePlan();
  useEffect(() => {
    let current = true;
    void readyToChat().then((ready) => {
      if (!current) return;
      if (ready) void loadSaved();
      else navigate("/app", { replace: true });
    });
    return () => {
      current = false;
    };
  }, [loadSaved, navigate]);
}

function TryChat() {
  const { curriculum, isLoaded } = usePlan();
  const visible = useVisualViewport(true);
  useReadyDevice();
  const scope = scopeOf({ kind: "general" }, curriculum);

  return (
    <div
      style={chatViewportStyle(visible)}
      className={cn(
        "flex flex-col overflow-hidden bg-canvas",
        CHAT_VIEWPORT_CLASS,
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-[max(1rem,var(--overscan-x))] pt-[max(0.75rem,var(--overscan-y))] pb-3">
        <Logo />
        <SignInLink onClick={() => rememberChat(TRY_CHAT)} />
      </header>
      <main className="flex min-h-0 flex-1 flex-col pe-[var(--overscan-x)] pb-[var(--overscan-y)]">
        {isLoaded && scope ? (
          <ChatView scope={scope} />
        ) : (
          <div
            role="status"
            className="flex h-full items-center justify-center"
          >
            <Spinner />
          </div>
        )}
      </main>
    </div>
  );
}

/** The chat for a visitor with no account: text only, with no voice and nothing kept of them on
 * the server. What they say about themselves stays in this browser. Signing in is offered, and
 * leads to the learner's own chat. */
export default function TryPage() {
  const account = useAccount();
  // Before any child's effect can make a request, which a layout effect precedes.
  useLayoutEffect(() => holdAnonymousSession(), []);
  if (account) return <Navigate to={TRY_CHAT} replace />;
  return (
    <ChatOnlyProviders>
      <TryChat />
    </ChatOnlyProviders>
  );
}
