import { useEffect, useRef } from "react";

import { Button, InlineLoading, InlineNotification } from "@carbon/react";

import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import { acquisitionPhaseLabel, formatFileSize } from "../domain/modelAcquisition";
import { useModelAcquisition } from "./useModelAcquisition";

/**
 * Setting graspy up to read a photographed lesson plan.
 *
 * Reading a page takes a file the lesson engine does not otherwise need, so it
 * is offered where a teacher would want it — beside the box they would
 * otherwise type the plan into — rather than added to the download every
 * teacher waits through on their first run.
 *
 * `onReady` is how the screen around this learns the way in is open, because
 * whether a photograph can be read is asked once and answered before this
 * offer existed.
 */
export function PhotographReadingSetup({
  gateway,
  onReady,
}: {
  readonly gateway: ModelAcquisitionGateway;
  readonly onReady: () => void;
}) {
  const setup = useModelAcquisition(gateway);
  // A machine that already holds the file is recognised here, which can happen
  // after the screen around this has asked whether a page can be read. Saying so
  // opens the way in where the teacher already is.
  const tell = useRef(onReady);
  tell.current = onReady;
  useEffect(() => {
    if (setup.status === "ready") tell.current();
  }, [setup.status]);

  if (setup.status === "checking" || setup.status === "ready") return null;

  const total = setup.snapshot?.totalBytes;
  const done = setup.progress?.processedBytes ?? setup.snapshot?.downloadedBytes ?? 0;
  const working = setup.status === "working";

  return (
    <div className="grid justify-items-start gap-sm rounded-card border border-rule bg-paper-accent p-md">
      <p className="m-0 max-w-[62ch] text-sm leading-body text-ink-secondary">
        graspy can read a lesson plan you have written by hand, from a photograph of the page.
        {total === undefined
          ? " Setting that up takes one more file."
          : ` Setting that up takes one more file of ${formatFileSize(total)}, downloaded once.`}
      </p>
      {working ? (
        <div className="flex flex-wrap items-center gap-sm">
          <InlineLoading
            description={`${acquisitionPhaseLabel(setup.progress?.phase ?? "downloading")} ${
              total === undefined ? "" : `${formatFileSize(done)} of ${formatFileSize(total)}`
            }`.trim()}
          />
          <Button kind="ghost" type="button" onClick={() => void setup.cancel()}>
            Stop
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-sm">
          <Button
            kind="tertiary"
            type="button"
            onClick={() => void setup.download().then(onReady)}
          >
            {setup.snapshot?.state === "partial"
              ? "Continue setting up photographs"
              : "Set up reading from photographs"}
          </Button>
          <Button
            kind="ghost"
            type="button"
            onClick={() => void setup.importFile().then(onReady)}
          >
            Use a file from a USB stick
          </Button>
        </div>
      )}
      {setup.status === "failed" && setup.failure ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Photograph reading was not set up"
          subtitle={setup.failure.message}
        />
      ) : null}
    </div>
  );
}
