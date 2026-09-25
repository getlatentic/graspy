import { Button } from "@carbon/react";
import { useState } from "react";

import { describeLaunchFailure, type LaunchFailure } from "../domain/launchHealth";

interface LaunchFailureScreenProps {
  readonly failure: LaunchFailure;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}

export function LaunchFailureScreen({
  failure,
  retrying,
  onRetry,
}: LaunchFailureScreenProps) {
  const [copied, setCopied] = useState(false);
  const description = describeLaunchFailure(failure);

  async function copyDetail() {
    await navigator.clipboard.writeText(failure.detail);
    setCopied(true);
  }

  return (
    <main className="flex min-h-dvh w-dvw max-w-full flex-col bg-canvas text-ink">
      <header className="flex min-h-[var(--app-header-block-size)] w-full items-center border-b border-rule bg-paper px-lg py-sm">
        <div className="group/brand flex min-w-0 items-center gap-[0.5rem] border-0 bg-transparent p-0 text-start" aria-label="graspy teacher workspace">
          <span className="font-wordmark text-[1.5rem] font-extrabold leading-none tracking-[-0.02em] text-brand">graspy</span>
          <span className="hidden truncate text-sm text-muted min-[40rem]:inline">teacher workspace</span>
        </div>
      </header>

      <section
        className="flex w-full max-w-[68ch] flex-1 flex-col justify-center gap-md self-center px-lg py-xl min-[48rem]:gap-lg min-[48rem]:px-xl min-[48rem]:py-2xl [&_h1]:m-0 [&_h1]:font-display [&_h1]:text-xl [&_h1]:leading-display [&_h1]:text-ink min-[48rem]:[&_h1]:text-display"
        role="alert"
        aria-labelledby="launch-failure-title"
      >
        <h1 id="launch-failure-title">{description.title}</h1>
        <p className="m-0 text-base leading-reading text-ink">{description.explanation}</p>
        <p className="m-0 border-s border-accent ps-sm text-base leading-reading text-ink-secondary">{description.recovery}</p>

        <div className="mt-xs flex flex-wrap gap-sm">
          {description.retryable ? (
            <Button size="lg" disabled={retrying} onClick={onRetry}>
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          ) : null}
          <Button kind="tertiary" size="lg" onClick={() => void copyDetail()}>
            {copied ? "Details copied" : "Copy details"}
          </Button>
        </div>

        <details className="border border-rule bg-paper-soft [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:whitespace-pre-wrap [&>pre]:border-t [&>pre]:border-rule [&>pre]:p-md [&>pre]:font-technical [&>pre]:text-sm [&>pre]:text-ink [&>pre]:[overflow-wrap:anywhere] [&>summary]:flex [&>summary]:min-h-[44px] [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:px-md [&>summary]:py-sm [&>summary]:text-sm [&>summary]:text-ink-secondary [&>summary]:focus-visible:outline-2 [&>summary]:focus-visible:outline-focus [&>summary]:focus-visible:-outline-offset-2">
          <summary>Details for your support contact</summary>
          <pre>{failure.detail}</pre>
        </details>
      </section>
    </main>
  );
}
