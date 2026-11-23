import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useBackHandler } from "@/hooks/use-back-handler";
import { useEventStore } from "../hooks/use-event-log";
import { copyText } from "../lib/copy-text";
import type { EventStore } from "../lib/event-store";
import { buildReport } from "../lib/report";
import { environmentFacts, featureFacts, type Fact } from "../lib/snapshot";

const FactTable = memo(function FactTable({
  title,
  facts,
}: {
  title: string;
  facts: Fact[];
}) {
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
});

/** The only part that follows the events, so a pointer moving does not redraw the rest. */
function EventList({ store }: { store: EventStore }) {
  const log = useSyncExternalStore(store.subscribe, store.get);
  return (
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
  );
}

/** The facts are read when the page opens and when the window changes size, not on every event. */
function useFacts() {
  const [facts, setFacts] = useState(() => ({
    environment: environmentFacts(),
    features: featureFacts(),
  }));
  useEffect(() => {
    const read = () =>
      setFacts({ environment: environmentFacts(), features: featureFacts() });
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return facts;
}

/**
 * Not linked from the app. Shows what this browser says it is and which keys
 * and pointer events really reach the page, to read on a TV. Nothing is stored
 * or sent. The first Back is swallowed and shown in the log; a second one, or
 * the Leave button (first in the tab order), goes home.
 */
export default function TvDiagnosticsPage() {
  const navigate = useNavigate();
  const store = useEventStore();
  const { environment, features } = useFacts();
  const [note, setNote] = useState<string | null>(null);
  const backs = useRef(0);
  useBackHandler(true, () => {
    backs.current += 1;
    if (backs.current > 1) navigate("/");
    else setNote("Press Back again to leave.");
  });

  const copy = async () => {
    const report = buildReport(environment, features, store.get());
    setNote(
      (await copyText(report))
        ? "Copied."
        : "Copy is not available here; read the lists.",
    );
  };

  return (
    <main className="min-h-dvh bg-canvas px-[var(--overscan-x)] py-[var(--overscan-y)] text-ink">
      <title>TV diagnostics</title>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 py-6">
        <h1 className="text-5xl font-semibold">TV diagnostics</h1>
        <p className="text-2xl text-muted">
          Press keys on the remote and move the pointer. Each event the page
          receives is listed below. Nothing is stored or sent. Back is the key
          with keyCode 461 (LG) or 10009 (Samsung), or Backspace on a TV; Escape
          closes a popup and nothing more on a desktop.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" variant="secondary" onClick={() => navigate("/")}>
            Leave
          </Button>
          <Button size="lg" onClick={copy}>
            Copy report
          </Button>
          <Button size="lg" variant="secondary" onClick={store.clear}>
            Clear log
          </Button>
          <p role="status" className="text-2xl">
            {note}
          </p>
        </div>
        <FactTable title="Environment" facts={environment} />
        <FactTable title="Features" facts={features} />
        <EventList store={store} />
      </div>
    </main>
  );
}
