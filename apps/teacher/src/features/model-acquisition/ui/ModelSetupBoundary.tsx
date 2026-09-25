import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import type { ReactNode } from "react";

import type { LessonModelGateway } from "../../model-catalogue/application/LessonModelGateway";
import { LessonModelPicker } from "../../model-catalogue/ui/LessonModelPicker";
import { useLessonModels } from "../../model-catalogue/ui/useLessonModels";
import type { ModelAcquisitionGateway } from "../application/ModelAcquisitionGateway";
import {
  acquisitionPhaseLabel,
  formatFileSize,
} from "../domain/modelAcquisition";
import { useModelAcquisition } from "./useModelAcquisition";

interface ModelSetupBoundaryProps {
  readonly gateway: ModelAcquisitionGateway;
  readonly lessonModelGateway: LessonModelGateway;
  readonly children: ReactNode;
}

export function ModelSetupBoundary({
  gateway,
  lessonModelGateway,
  children,
}: ModelSetupBoundaryProps) {
  const controller = useModelAcquisition(gateway);
  const lessonModels = useLessonModels(lessonModelGateway);

  if (controller.status === "ready") return children;

  // The size belongs to whichever model is chosen, so it is stated once known
  // rather than guessed at and corrected on screen.
  const selectedModel = lessonModels.choices.find((choice) => choice.isSelected);
  const totalBytes = controller.snapshot?.totalBytes ?? selectedModel?.downloadBytes;
  const downloadedBytes = controller.progress?.processedBytes
    ?? controller.snapshot?.downloadedBytes
    ?? 0;
  const progressPercent = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : 0;
  const working = controller.status === "working";
  const hasPartial = controller.snapshot?.state === "partial";

  return (
    <main className="readiness-shell min-h-dvh w-dvw max-w-full bg-canvas text-ink motion-reduce:[&_*]:!transition-none">
      <header className="flex min-h-[var(--app-header-block-size)] w-full items-center justify-between gap-md border-b border-rule bg-paper px-lg py-sm min-[48rem]:px-xl">
        <div className="group/brand flex min-w-0 items-center gap-[0.5rem] border-0 bg-transparent p-0 text-start" aria-label="graspy teacher workspace">
          <span className="font-wordmark text-[1.5rem] font-extrabold leading-none tracking-[-0.02em] text-brand">graspy</span>
          <span className="hidden truncate text-sm text-muted min-[40rem]:inline">teacher workspace</span>
        </div>
        <span className="flex-none whitespace-nowrap text-sm font-bold text-muted">Computer setup</span>
      </header>

      <section className="grid min-h-[calc(100dvh-var(--app-header-block-size))] grid-cols-[minmax(0,1fr)] min-[48rem]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-labelledby="readiness-title">
        <div className="flex min-w-0 flex-col justify-center border-b border-rule bg-paper-accent px-lg py-xl min-[48rem]:border-b-0 min-[48rem]:border-e min-[48rem]:p-[clamp(2rem,5vw,5rem)] min-[48rem]:py-2xl">
          <p className="m-0 mb-xs text-sm font-extrabold text-accent">One-time setup</p>
          <h1 className="m-0 max-w-[13ch] font-display text-display font-extrabold leading-display tracking-[-0.035em] text-ink [overflow-wrap:anywhere]" id="readiness-title">Work without an internet connection</h1>
          <p className="mt-lg mb-0 max-w-[52ch] text-base leading-body text-ink-secondary">
            {totalBytes === undefined
              ? "Add the required file once. After that, graspy can prepare lessons and classwork without internet access."
              : `Add the required ${formatFileSize(totalBytes)} file once. After that, graspy can prepare lessons and classwork without internet access.`}
          </p>
          <ol className="mt-xl mb-0 hidden list-none gap-sm p-0 text-ink-secondary min-[48rem]:grid [&>li]:flex [&>li]:items-center [&>li]:gap-sm [&>li]:font-bold [&_span]:grid [&_span]:size-[1.75rem] [&_span]:flex-none [&_span]:place-items-center [&_span]:rounded-pill [&_span]:border [&_span]:border-rule-strong [&_span]:font-technical [&_span]:text-xs [&_span]:text-accent">
            <li><span>1</span> Choose how to add the file</li>
            <li><span>2</span> graspy checks it before use</li>
            <li><span>3</span> Continue to your academic workspace</li>
          </ol>
        </div>

        <div className="flex min-w-0 flex-col justify-center bg-paper px-lg py-lg min-[48rem]:p-[clamp(2rem,5vw,5rem)] min-[48rem]:py-2xl">
          <div className="[&_h2]:m-0 [&_h2]:max-w-[20ch] [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:leading-display [&_h2]:tracking-[-0.035em] [&_h2]:text-ink [&_h2]:[overflow-wrap:anywhere] min-[48rem]:[&_h2]:text-xl">
            <p className="m-0 mb-xs text-sm font-extrabold text-accent">Choose one</p>
            <h2>How should this computer get ready?</h2>
          </div>

          <LessonModelPicker controller={lessonModels} />

          {controller.status === "checking" ? (
            <InlineLoading description="Checking this computer…" />
          ) : (
            <>
              {controller.failure ? (
                <InlineNotification
                  className="mt-lg w-full max-w-none"
                  kind={controller.status === "cancelled" ? "info" : "error"}
                  lowContrast
                  hideCloseButton
                  title={controller.status === "cancelled" ? "Setup stopped" : "Setup needs attention"}
                  subtitle={controller.failure.message}
                />
              ) : null}

              {working ? (
                <div className="mt-xl grid gap-md border-y border-rule-strong py-lg [&_.cds--btn]:w-full [&_.cds--btn]:max-w-none [&_.cds--btn]:min-h-[3rem] [&_.cds--btn]:whitespace-nowrap [&_p]:m-0 [&_p]:text-sm [&_p]:leading-body [&_p]:text-muted [&_progress]:h-xs [&_progress]:w-full [&_progress]:border-0 [&_progress]:bg-rule [&_progress]:accent-accent [&_progress::-webkit-progress-bar]:bg-rule [&_progress::-webkit-progress-value]:bg-accent" aria-live="polite">
                  <div className="flex items-baseline justify-between gap-md tabular-nums text-ink-secondary">
                    <strong>
                      {controller.progress
                        ? acquisitionPhaseLabel(controller.progress.phase)
                        : "Starting"}
                    </strong>
                    <span>{progressPercent}%</span>
                  </div>
                  <progress max={totalBytes} value={downloadedBytes}>
                    {progressPercent}%
                  </progress>
                  <p className="mt-xs mb-0 max-w-[48ch] text-base leading-body text-ink-secondary">
                    {totalBytes === undefined
                      ? formatFileSize(downloadedBytes)
                      : `${formatFileSize(downloadedBytes)} of ${formatFileSize(totalBytes)}`}
                  </p>
                  <Button kind="tertiary" size="lg" onClick={() => void controller.cancel()}>
                    Stop for now
                  </Button>
                </div>
              ) : (
                <div className="mt-lg grid border-t border-rule-strong min-[48rem]:mt-xl">
                  <section className="grid min-w-0 gap-lg border-b border-rule-strong py-md min-[48rem]:py-lg min-[72rem]:grid-cols-[minmax(0,1fr)_14rem] min-[72rem]:items-end [&_.cds--btn]:w-full [&_.cds--btn]:max-w-none [&_.cds--btn]:min-h-[3rem] [&_.cds--btn]:whitespace-nowrap [&_h3]:text-md [&_h3]:leading-heading">
                    <div>
                      <p className="m-0 mb-xs text-sm font-extrabold text-accent">Internet available</p>
                      <h3 className="m-0 text-md font-extrabold leading-heading text-ink">{hasPartial ? "Continue the download" : "Download on this computer"}</h3>
                      <p className="mt-xs mb-0 max-w-[48ch] text-base leading-body text-ink-secondary">
                        {hasPartial
                          ? `Continue from ${formatFileSize(controller.snapshot?.downloadedBytes ?? 0)}. Your earlier progress is saved.`
                          : "Best when this computer can stay connected until the file is ready."}
                      </p>
                    </div>
                    <Button size="lg" onClick={() => void controller.download()}>
                      {hasPartial ? "Continue download" : "Download file"}
                    </Button>
                  </section>

                  <section className="grid min-w-0 gap-lg border-b border-rule-strong py-md min-[48rem]:py-lg min-[72rem]:grid-cols-[minmax(0,1fr)_14rem] min-[72rem]:items-end [&_.cds--btn]:w-full [&_.cds--btn]:max-w-none [&_.cds--btn]:min-h-[3rem] [&_.cds--btn]:whitespace-nowrap [&_h3]:text-md [&_h3]:leading-heading">
                    <div>
                      <p className="m-0 mb-xs text-sm font-extrabold text-accent">File already available</p>
                      <h3 className="m-0 text-md font-extrabold leading-heading text-ink">Use a USB or storage device</h3>
                      <p className="mt-xs mb-0 max-w-[48ch] text-base leading-body text-ink-secondary">
                        Choose the approved file. graspy will copy and check it before use.
                      </p>
                    </div>
                    <Button kind="tertiary" size="lg" onClick={() => void controller.importFile()}>
                      Choose a file
                    </Button>
                  </section>
                </div>
              )}
            </>
          )}

          <p className="mt-lg mb-0 max-w-[58ch] text-sm leading-body text-muted [&_a]:text-accent [&_a]:[text-underline-offset:0.2em]">
            The required file is supplied under its {controller.snapshot?.artifactLicense ?? "published"} licence and
            is subject to the provider’s <a href={controller.snapshot?.upstreamTermsUrl ?? "https://ai.google.dev/gemma/docs/gemma_4_license"} target="_blank" rel="noreferrer">usage terms</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
