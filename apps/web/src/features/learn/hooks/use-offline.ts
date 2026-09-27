import { useEffect } from "react";
import { sendKept } from "@/lib/mcp/outbox";
import { readAllViews } from "@/lib/mcp/server";

/** Keeps every view while online so it opens offline later; on reconnect, sends what was kept. */
export function useOffline(sent: () => void): void {
  useEffect(() => {
    const catchUp = () => {
      readAllViews().catch((error: unknown) =>
        console.warn("Keeping the views failed:", error),
      );
      sendKept()
        .then((count) => count > 0 && sent())
        .catch((error: unknown) =>
          console.warn("Sending what was kept failed:", error),
        );
    };
    catchUp();
    window.addEventListener("online", catchUp);
    return () => window.removeEventListener("online", catchUp);
  }, [sent]);
}
