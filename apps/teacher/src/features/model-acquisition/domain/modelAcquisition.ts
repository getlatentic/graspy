export type ModelInstallationState = "absent" | "partial" | "installed";
export type ModelAcquisitionPhase = "downloading" | "importing" | "verifying";

export interface ModelInstallationSnapshot {
  readonly state: ModelInstallationState;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly artifactLicense: string;
  readonly artifactLicenseUrl: string;
  readonly upstreamTermsUrl: string;
}

export interface ModelAcquisitionProgress {
  readonly requestId: string;
  readonly phase: ModelAcquisitionPhase;
  readonly processedBytes: number;
  readonly totalBytes: number;
}

export interface ModelAcquisitionFailure {
  readonly code: string;
  readonly message: string;
}

export function formatFileSize(bytes: number): string {
  const gibibytes = bytes / (1024 ** 3);
  if (gibibytes >= 1) return `${gibibytes.toFixed(1)} GB`;
  return `${Math.ceil(bytes / (1024 ** 2))} MB`;
}

export function acquisitionPhaseLabel(phase: ModelAcquisitionPhase): string {
  switch (phase) {
    case "downloading":
      return "Downloading";
    case "importing":
      return "Copying file";
    case "verifying":
      return "Checking file";
  }
}

export function normalizeAcquisitionFailure(error: unknown): ModelAcquisitionFailure {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "setup_failed",
    message: "Setup could not be completed. Try again.",
  };
}
