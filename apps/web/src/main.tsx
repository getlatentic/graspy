import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/600.css";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { haptics } from "@/features/haptics/lib/haptics";
import { installSelectSound } from "@/features/haptics/lib/select-sound";
import { I18nProvider } from "@/lib/i18n-provider";
import { installAppWorker } from "@/lib/app-worker";
import { markDevice } from "@/lib/device";
import { installFragmentLinks } from "@/lib/fragment-links";
import { installRemoteInput } from "@/lib/remote-input";
import { listenForInstall } from "@/lib/install";
import { dismissBootSplashWhenDrawn } from "@/app/boot-splash";
import { listenForStaleChunks } from "@/app/page-chunks";
import { finishPendingWipe } from "@/lib/wipe-pending";
import { warmApi } from "@/lib/warm-api";
import { router } from "./routes";

declare global {
  interface Window {
    /** Set by index.html: tells it the app's scripts all parsed. */
    __graspyBooted?: () => void;
  }
}

window.__graspyBooted?.();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

markDevice();
installRemoteInput();
installSelectSound(haptics);
installFragmentLinks();
listenForStaleChunks();
listenForInstall();
installAppWorker();
warmApi();

function render(): void {
  dismissBootSplashWhenDrawn();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <RouterProvider router={router} />
          </I18nProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

finishPendingWipe()
  .catch((error: unknown) => console.error("Wiping the device failed:", error))
  .finally(render);
