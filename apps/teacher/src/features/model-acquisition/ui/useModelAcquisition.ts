import { useEffect, useRef, useState } from "react";

import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import {
  normalizeAcquisitionFailure,
  type ModelAcquisitionFailure,
  type ModelAcquisitionProgress,
  type ModelInstallationSnapshot,
} from "../domain/modelAcquisition";

export type SetupStatus =
  | "checking"
  | "idle"
  | "working"
  | "cancelled"
  | "failed"
  | "ready";

export interface ModelAcquisitionController {
  readonly status: SetupStatus;
  readonly snapshot?: ModelInstallationSnapshot;
  readonly progress?: ModelAcquisitionProgress;
  readonly failure?: ModelAcquisitionFailure;
  download(): Promise<void>;
  importFile(): Promise<void>;
  cancel(): Promise<void>;
}

export function useModelAcquisition(
  gateway: ModelAcquisitionGateway,
): ModelAcquisitionController {
  const [status, setStatus] = useState<SetupStatus>("checking");
  const [snapshot, setSnapshot] = useState<ModelInstallationSnapshot>();
  const [progress, setProgress] = useState<ModelAcquisitionProgress>();
  const [failure, setFailure] = useState<ModelAcquisitionFailure>();
  const activeRequest = useRef<string | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void gateway.subscribe((nextProgress) => {
      if (nextProgress.requestId === activeRequest.current) {
        setProgress(nextProgress);
      }
    }).then((stop) => {
      if (disposed) stop();
      else unsubscribe = stop;
    });
    void gateway.getInstallation().then(
      (installation) => {
        if (disposed) return;
        setSnapshot(installation);
        setStatus(installation.state === "installed" ? "ready" : "idle");
      },
      (error) => {
        if (disposed) return;
        setFailure(normalizeAcquisitionFailure(error));
        setStatus("failed");
      },
    );
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [gateway]);

  const run = async (
    operation: (requestId: string) => Promise<ModelInstallationSnapshot>,
  ) => {
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setFailure(undefined);
    setProgress(undefined);
    setStatus("working");
    try {
      const installation = await operation(requestId);
      setSnapshot(installation);
      setStatus("ready");
    } catch (error) {
      const nextFailure = normalizeAcquisitionFailure(error);
      setFailure(nextFailure);
      setStatus(nextFailure.code === "cancelled" ? "cancelled" : "failed");
      const installation = await gateway.getInstallation();
      setSnapshot(installation);
    } finally {
      activeRequest.current = undefined;
    }
  };

  const download = () => run((requestId) => gateway.download(requestId));

  const importFile = async () => {
    const sourcePath = await gateway.chooseImportFile();
    if (!sourcePath) return;
    await run((requestId) => gateway.importFile(requestId, sourcePath));
  };

  const cancel = async () => {
    if (!activeRequest.current) return;
    await gateway.cancel(activeRequest.current);
  };

  return { status, snapshot, progress, failure, download, importFile, cancel };
}
