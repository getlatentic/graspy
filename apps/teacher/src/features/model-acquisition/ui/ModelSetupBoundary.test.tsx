import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LessonModelGateway } from "../../model-catalogue/application/LessonModelGateway";
import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import type {
  ModelAcquisitionProgress,
  ModelInstallationSnapshot,
} from "../domain/modelAcquisition";
import { ModelSetupBoundary } from "./ModelSetupBoundary";

const absent: ModelInstallationSnapshot = {
  state: "absent",
  downloadedBytes: 0,
  totalBytes: 2_841_481_184,
  artifactLicense: "Apache-2.0",
  artifactLicenseUrl: "https://example.com/licence",
  upstreamTermsUrl: "https://example.com/terms",
};

const installed: ModelInstallationSnapshot = {
  ...absent,
  state: "installed",
  downloadedBytes: absent.totalBytes,
};

function gatewayWith(
  installation: ModelInstallationSnapshot,
  overrides: Partial<ModelAcquisitionGateway> = {},
): ModelAcquisitionGateway {
  return {
    getInstallation: vi.fn().mockResolvedValue(installation),
    download: vi.fn().mockResolvedValue(installed),
    chooseImportFile: vi.fn().mockResolvedValue(null),
    importFile: vi.fn().mockResolvedValue(installed),
    cancel: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    ...overrides,
  };
}

/** One offered model, so the picker stays out of the way — as it does today. */
function lessonModelGatewayWith(
  choices: readonly unknown[] = [{ id: "standard", isSelected: true }],
): LessonModelGateway {
  return {
    listModels: vi.fn().mockResolvedValue(choices),
    chooseModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as LessonModelGateway;
}

describe("ModelSetupBoundary", () => {
  it("skips setup when the verified installation is restored", async () => {
    render(
      <ModelSetupBoundary
        gateway={gatewayWith(installed)}
        lessonModelGateway={lessonModelGatewayWith()}
      >
        <p>Academic workspace</p>
      </ModelSetupBoundary>,
    );

    expect(await screen.findByText("Academic workspace")).toBeVisible();
    expect(screen.queryByText("One-time setup")).not.toBeInTheDocument();
  });

  it("offers download and storage routes without technical language", async () => {
    render(
      <ModelSetupBoundary
        gateway={gatewayWith(absent)}
        lessonModelGateway={lessonModelGatewayWith()}
      >
        <p>Academic workspace</p>
      </ModelSetupBoundary>,
    );

    expect(await screen.findByRole("button", { name: "Download file" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose a file" })).toBeVisible();
    expect(screen.queryByText(/model|checksum|sha-256|repository/i)).not.toBeInTheDocument();
  });

  it("continues a restart-safe partial download", async () => {
    const download = vi.fn().mockResolvedValue(installed);
    const gateway = gatewayWith(
      { ...absent, state: "partial", downloadedBytes: 536_870_912 },
      { download },
    );
    const user = userEvent.setup();
    render(
      <ModelSetupBoundary
        gateway={gateway}
        lessonModelGateway={lessonModelGatewayWith()}
      >
        <p>Academic workspace</p>
      </ModelSetupBoundary>,
    );

    await user.click(await screen.findByRole("button", { name: "Continue download" }));

    expect(download).toHaveBeenCalledOnce();
    expect(await screen.findByText("Academic workspace")).toBeVisible();
  });

  it("reports correlated progress and exposes cancellation", async () => {
    let progressListener: ((progress: ModelAcquisitionProgress) => void) | undefined;
    let finishDownload: ((snapshot: ModelInstallationSnapshot) => void) | undefined;
    const download = vi.fn().mockImplementation(
      () => new Promise<ModelInstallationSnapshot>((resolve) => {
        finishDownload = resolve;
      }),
    );
    const cancel = vi.fn().mockResolvedValue(undefined);
    const gateway = gatewayWith(absent, {
      download,
      cancel,
      subscribe: vi.fn().mockImplementation(async (listener) => {
        progressListener = listener;
        return () => undefined;
      }),
    });
    const user = userEvent.setup();
    render(
      <ModelSetupBoundary
        gateway={gateway}
        lessonModelGateway={lessonModelGatewayWith()}
      >
        <p>Academic workspace</p>
      </ModelSetupBoundary>,
    );

    await user.click(await screen.findByRole("button", { name: "Download file" }));
    const requestId = vi.mocked(download).mock.calls[0]?.[0];
    progressListener?.({
      requestId,
      phase: "downloading",
      processedBytes: absent.totalBytes / 2,
      totalBytes: absent.totalBytes,
    });

    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "value",
      String(absent.totalBytes / 2),
    );
    await user.click(screen.getByRole("button", { name: "Stop for now" }));
    expect(cancel).toHaveBeenCalledWith(requestId);

    finishDownload?.(installed);
    await waitFor(() => expect(screen.getByText("Academic workspace")).toBeVisible());
  });

  it("imports only after a teacher chooses a file", async () => {
    const chooseImportFile = vi.fn().mockResolvedValue("/Volumes/USB/graspy.gguf");
    const importFile = vi.fn().mockResolvedValue(installed);
    const gateway = gatewayWith(absent, { chooseImportFile, importFile });
    const user = userEvent.setup();
    render(
      <ModelSetupBoundary
        gateway={gateway}
        lessonModelGateway={lessonModelGatewayWith()}
      >
        <p>Academic workspace</p>
      </ModelSetupBoundary>,
    );

    await user.click(await screen.findByRole("button", { name: "Choose a file" }));

    expect(importFile).toHaveBeenCalledWith(
      expect.any(String),
      "/Volumes/USB/graspy.gguf",
    );
    expect(await screen.findByText("Academic workspace")).toBeVisible();
  });
});
