import { Button } from "@/components/ui/button";

/** Not translated: it must render when a failure takes the providers down too. */
export function ErrorScreen({ error }: { error: unknown }) {
  const detail =
    error instanceof Error
      ? (error.stack ?? error.message)
      : JSON.stringify(error, null, 2);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-muted">
          The page stopped unexpectedly. Reloading usually clears it — your
          saved curriculum and lessons are kept on this device.
        </p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
        {import.meta.env.DEV && (
          <pre className="mt-6 overflow-x-auto rounded-control border border-line bg-surface p-3 text-start text-xs text-muted">
            {detail}
          </pre>
        )}
      </div>
    </main>
  );
}
