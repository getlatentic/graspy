import { useEffect, useState, type ReactNode } from "react";

import type { LessonDocumentImporter } from "../application/LessonDocumentImporter";
import type { LessonPhotographReader } from "../application/LessonPhotographReader";

/**
 * What a teacher can bring a plan in with on this machine.
 *
 * One object rather than a prop each, so a way in cannot be wired where the app
 * is assembled and dropped by a screen on the way down: every screen between
 * passes it whole.
 */
export interface WaysToBringInAPlan {
  readonly documentImporter?: LessonDocumentImporter;
  readonly photographReader?: LessonPhotographReader;
  /** The offer to set reading up, where there is nothing to read a page with. */
  readonly photographReadingSetup?: (onReady: () => void) => ReactNode;
}

/** Which way in is running, if either is. */
export type BringingIn = "document" | "photograph" | null;

/** What the last attempt to bring a plan in came to, if there has been one. */
export type ImportOutcome =
  | { readonly kind: "read"; readonly fileName: string }
  | { readonly kind: "failed"; readonly message: string }
  | null;

/**
 * Bringing in a lesson plan the teacher already has, from a file or from a
 * photograph of the page.
 *
 * Both land the words wherever a paste would land, so the teacher reads and
 * edits them before anything is built from them — bringing a plan in is a way
 * of typing, not a way of generating. A photograph also leaves the page on
 * screen: about two written words in three survive being read off one, and a
 * word cannot be corrected against a source that is not there.
 *
 * One outcome, because only one way in runs at a time and the teacher is owed
 * the result of the one they just took, not the one before it. A closed file
 * picker is not a result: the teacher changed their mind.
 */
export function useBringingInAPlan(
  { documentImporter: importer, photographReader: reader }: WaysToBringInAPlan,
  receive: (text: string) => void,
) {
  const [bringingIn, setBringingIn] = useState<BringingIn>(null);
  // Reading a photograph takes a second file beside the model's weights, so the
  // way in is offered only where there is one to read with.
  const [photographsCanBeRead, setPhotographsCanBeRead] = useState(false);
  const [asked, setAsked] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome>(null);
  const [page, setPage] = useState<string | null>(null);

  useEffect(() => {
    let listening = true;
    void reader?.canRead().then((can) => listening && setPhotographsCanBeRead(can));
    return () => {
      listening = false;
    };
  }, [reader, asked]);

  const bringIn = async (
    way: NonNullable<BringingIn>,
    from: () => Promise<{ fileName: string; text: string; page?: string } | null>,
  ) => {
    setOutcome(null);
    setBringingIn(way);
    try {
      const brought = await from();
      if (brought === null) return;
      receive(brought.text);
      setPage(brought.page ?? null);
      setOutcome({ kind: "read", fileName: brought.fileName });
    } catch (error) {
      setOutcome({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBringingIn(null);
    }
  };

  return {
    bringingIn,
    outcome,
    page,
    offering: {
      document: importer !== undefined,
      photograph: reader !== undefined && photographsCanBeRead,
    },
    importDocument: () => (importer ? bringIn("document", () => importer.importPlan()) : undefined),
    readPhotograph: () => (reader ? bringIn("photograph", () => reader.readPlan()) : undefined),
    stopReading: () => reader?.stopReading(),
    /// Asked once, and again when a teacher has just set photograph reading up.
    checkAgain: () => setAsked((times) => times + 1),
  };
}
