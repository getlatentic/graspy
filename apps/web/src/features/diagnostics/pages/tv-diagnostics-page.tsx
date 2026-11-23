import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useBackHandler } from "@/hooks/use-back-handler";
import { useEventLog } from "../hooks/use-event-log";
import { copyText } from "../lib/copy-text";
import { buildReport } from "../lib/report";
import { environmentFacts, featureFacts, type Fact } from "../lib/snapshot";

function FactTable({ title, facts }: { title: string; facts: Fact[] }) {
  return (
    <section>
      <h2 className="mb-2 text-3xl font-semibold">{title}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-1 text-2xl">
        {facts.map((fact) => (
          <div key={fact.name} className="contents">
            <dt className="text-muted">{fact.name}</dt>
            <dd className="break-words">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const nothing = () => undefined;

/**
 * Not linked from the app. Shows what this browser says it is and which keys
 * and pointer events really reach the page, to read on a TV. Nothing is stored
 * or sent. Back is swallowed here so it can be seen in the log instead of
 * leaving the page; the Leave button goes home.
 */
export default function TvDiagnosticsPage() {
  const navigate = useNavigate();
  const { log, clear } = useEventLog();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useBackHandler(true, nothing);

  useEffect(() => {
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  const environment = environmentFacts();
  const features = featureFacts();
  const copy = async () =>
    setCopied(
      (await copyText(buildReport(environment, features, log))) ? "yes" : "no",
    );

  return (
    <main className="safe-frame min-h-dvh bg-canvas text-ink">
      <title>TV diagnostics</title>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 py-6">
        <h1 className="text-5xl font-semibold">TV diagnostics</h1>
        <p className="text-2xl text-muted">
          Press keys on the remote and move the pointer. Each event the page
          receives is listed below. Nothing is stored or sent.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={copy} data-focus-key="copy">
            Copy report
          </Button>
          <Button size="lg" variant="secondary" onClick={clear}>
            Clear log
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate("/")}>
            Leave
          </Button>
          <p role="status" className="text-2xl">
            {copied === "yes" && "Copied."}
            {copied === "no" && "Copy is not available here; read the lists."}
          </p>
        </div>
        <FactTable title="Environment" facts={environment} />
        <FactTable title="Features" facts={features} />
        <section>
          <h2 className="mb-2 text-3xl font-semibold">
            Events (last {log.length} of 50)
          </h2>
          <ol className="space-y-1 font-mono text-xl">
            {log.length === 0 && <li className="text-muted">None yet.</li>}
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                {(entry.at / 1000).toFixed(2)}s {entry.text}
                {entry.count > 1 && ` x${entry.count}`}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
