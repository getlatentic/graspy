import { useCallback, useEffect, useState } from "react";

import type { LaunchHealthGateway } from "../application/LaunchHealthGateway";
import type { LaunchFailure } from "../domain/launchHealth";

export type LaunchStatus = "checking" | "healthy" | "failed" | "retrying";

export interface LaunchHealthController {
  readonly status: LaunchStatus;
  readonly failure?: LaunchFailure;
  retry(): Promise<void>;
}

function unanswered(error: unknown): LaunchFailure {
  return {
    code: "startup-check-unavailable",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function useLaunchHealth(
  gateway: LaunchHealthGateway,
): LaunchHealthController {
  const [status, setStatus] = useState<LaunchStatus>("checking");
  const [failure, setFailure] = useState<LaunchFailure>();

  const settle = useCallback((result: LaunchFailure | null) => {
    setFailure(result ?? undefined);
    setStatus(result ? "failed" : "healthy");
  }, []);

  useEffect(() => {
    let disposed = false;
    void gateway.check().then(
      (result) => {
        if (!disposed) settle(result);
      },
      (error: unknown) => {
        if (!disposed) settle(unanswered(error));
      },
    );
    return () => {
      disposed = true;
    };
  }, [gateway, settle]);

  const retry = async () => {
    setStatus("retrying");
    try {
      settle(await gateway.retry());
    } catch (error) {
      settle(unanswered(error));
    }
  };

  return { status, failure, retry };
}
