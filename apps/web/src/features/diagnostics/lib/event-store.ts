import { appended, listenForInput, type LogEntry } from "./event-log";

/** The same list, shown at most once per frame: a pointer sends many events a second and the page should not redraw for each. */
export interface EventStore {
  get(): readonly LogEntry[];
  subscribe(listener: () => void): () => void;
  clear(): void;
  /** Starts listening on `doc`; returns what stops it. */
  listen(doc: Document): () => void;
}

const nextFrame = (run: () => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(run)
    : setTimeout(run, 16);

export function createEventStore(): EventStore {
  let published: readonly LogEntry[] = [];
  let pending: readonly LogEntry[] = published;
  let queued = false;
  const listeners = new Set<() => void>();

  const publish = () => {
    queued = false;
    published = pending;
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    nextFrame(publish);
  };

  return {
    get: () => published,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      pending = [];
      schedule();
    },
    listen(doc) {
      const started = performance.now();
      return listenForInput(doc, (text, folds) => {
        const entry = { at: performance.now() - started, text, count: 1 };
        pending = appended(pending, entry, folds);
        schedule();
      });
    },
  };
}
