import { InlineLoading } from "@carbon/react";
import type { ReactNode } from "react";

import type { LaunchHealthGateway } from "../application/LaunchHealthGateway";
import { describeLaunchFailure } from "../domain/launchHealth";
import { LaunchFailureScreen } from "./LaunchFailureScreen";
import { LaunchNotice } from "./LaunchNotice";
import { useLaunchHealth } from "./useLaunchHealth";

interface LaunchBoundaryProps {
  readonly gateway: LaunchHealthGateway;
  readonly children: ReactNode;
}

/**
 * Holds the workspace back until graspy confirms it opened cleanly, so a
 * startup failure is stated instead of resurfacing later as an unrelated fault.
 */
export function LaunchBoundary({ gateway, children }: LaunchBoundaryProps) {
  const controller = useLaunchHealth(gateway);

  if (controller.status === "checking") {
    return (
      <main className="grid min-h-dvh w-dvw max-w-full place-items-center bg-canvas text-ink" aria-busy="true">
        <InlineLoading description="Opening graspy…" />
      </main>
    );
  }

  if (!controller.failure) return children;

  const retrying = controller.status === "retrying";
  const retry = () => void controller.retry();

  if (describeLaunchFailure(controller.failure).blocksWorkspace) {
    return (
      <LaunchFailureScreen
        key={controller.failure.detail}
        failure={controller.failure}
        retrying={retrying}
        onRetry={retry}
      />
    );
  }

  return (
    <>
      <LaunchNotice failure={controller.failure} retrying={retrying} onRetry={retry} />
      {children}
    </>
  );
}
