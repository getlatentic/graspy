import { useEffect } from "react";
import { Outlet, useRouteError } from "react-router";
import { ErrorScreen } from "@/components/error-screen";
import { LoadingScreen } from "@/components/loading-screen";
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

/** What shows while the app's first page loads. */
export function PageLoading() {
  return <LoadingScreen onRetry={() => window.location.reload()} />;
}

export function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}
