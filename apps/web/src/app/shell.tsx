import { useEffect } from "react";
import { Outlet, useRouteError } from "react-router";
import { ErrorScreen } from "@/components/error-screen";
import { Spinner } from "@/components/ui/spinner";
import { prefetchPages } from "./page-chunks";

export function AppShell() {
  useEffect(() => {
    const prefetch = () => void prefetchPages();
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(prefetch, 1_000);
    return () => window.clearTimeout(handle);
  }, []);

  return <Outlet />;
}

export function PageLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas text-accent-ink">
      <Spinner className="size-6" />
    </main>
  );
}

export function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}
