import { useEffect } from "react";
import { sendKept } from "@/lib/mcp/outbox";
import { readAllViews } from "@/lib/mcp/server";
import { whenIdle } from "@/lib/when-idle";

/** Keeps every view while online so it opens offline later; on reconnect, sends what was kept.
 * The first catch-up waits for the page to be idle: the screen does not need it. */
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
    let leaving = false;
    void whenIdle().then(() => leaving || catchUp());
    window.addEventListener("online", catchUp);
    return () => {
      leaving = true;
      window.removeEventListener("online", catchUp);
    };
  }, [sent]);
}
