import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import type { ModelInstallationSnapshot } from "../domain/modelAcquisition";
import { PhotographReadingSetup } from "./PhotographReadingSetup";

const HALF_A_GIGABYTE = 557_368_064;

function installedTo(
  state: ModelInstallationSnapshot["state"],
  downloadedBytes = 0,
): ModelInstallationSnapshot {
  return {
    state,
    downloadedBytes,
    totalBytes: HALF_A_GIGABYTE,
    artifactLicense: "Apache-2.0",
    artifactLicenseUrl: "https://example.com/licence",
    upstreamTermsUrl: "https://example.com/terms",
  };
}

function aGateway(overrides: Partial<ModelAcquisitionGateway> = {}): ModelAcquisitionGateway {
  return {
    getInstallation: vi.fn().mockResolvedValue(installedTo("absent")),
    download: vi.fn().mockResolvedValue(installedTo("installed")),
    chooseImportFile: vi.fn().mockResolvedValue(null),
    importFile: vi.fn().mockResolvedValue(installedTo("installed")),
    cancel: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(() => {}),
    ...overrides,
  };
}

afterEach(cleanup);

describe("setting graspy up to read a photographed lesson plan", () => {
  /// The file can already be on the machine — carried over from an earlier
  /// install, or restored with the library — and it is recognised here, after
  /// the screen around this has asked whether a page can be read. Without this
  /// the way in stays hidden until the teacher leaves the screen and comes back.
  it("says the reading is ready when it finds the file already there", async () => {
    const toldReady = vi.fn();
    // The screen around this re-renders when it is told, which is what makes
    // saying so once rather than on every render the whole of the problem.
    function AskingScreen() {
      const [times, setTimes] = useState(0);
      return (
        <>
          <p>asked {times}</p>
          <PhotographReadingSetup
            gateway={aGateway({
              getInstallation: vi.fn().mockResolvedValue(installedTo("installed")),
            })}
            onReady={() => {
              toldReady();
              setTimes((count) => count + 1);
            }}
          />
        </>
      );
    }
    render(<AskingScreen />);

    await screen.findByText("asked 1");
    expect(toldReady).toHaveBeenCalledTimes(1);
  });

  /// The file is not part of the download every teacher waits through, so the
  /// teacher is told what it costs before they agree to it.
  it("says what it takes before a teacher agrees to it", async () => {
    render(<PhotographReadingSetup gateway={aGateway()} onReady={vi.fn()} />);

    expect(await screen.findByText(/read a lesson plan you have written by hand/)).toBeVisible();
    expect(screen.getByText(/532 MB/)).toBeVisible();
  });

  it("opens the way in once it is set up", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<PhotographReadingSetup gateway={aGateway()} onReady={onReady} />);

    await user.click(
      await screen.findByRole("button", { name: "Set up reading from photographs" }),
    );

    expect(onReady).toHaveBeenCalled();
  });

  /// The download resumes where it stopped, so a teacher whose connection went
  /// is not asked to start half a gigabyte again.
  it("offers to continue a download that stopped part way", async () => {
    render(
      <PhotographReadingSetup
        gateway={aGateway({
          getInstallation: vi.fn().mockResolvedValue(installedTo("partial", 100_000_000)),
        })}
        onReady={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Continue setting up photographs" }),
    ).toBeVisible();
  });

  it("says nothing at all once a photograph can be read", async () => {
    const { container } = render(
      <PhotographReadingSetup
        gateway={aGateway({
          getInstallation: vi.fn().mockResolvedValue(installedTo("installed")),
        })}
        onReady={vi.fn()}
      />,
    );

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
