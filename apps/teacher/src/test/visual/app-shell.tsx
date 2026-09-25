import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { AppFrame } from "../../features/academic-workspace/ui/AcademicWorkspaceShell";

/**
 * The frame with something floating over it, where the two things that matter
 * can be measured: that the region keeps its full height when nothing floats,
 * and that the end of its content clears whatever does.
 */
export function Shell() {
  const [bar, setBar] = useState<"none" | "folded" | "open">("open");
  return (
    <AppFrame>
      <header className="flex-none border-b border-rule bg-paper px-lg py-md text-ink">
        <button type="button" data-cycle onClick={() => setBar(bar === "open" ? "folded" : bar === "folded" ? "none" : "open")}>
          A header that stays — bar is {bar}
        </button>
      </header>
      <AppFrame.Scrolls>
        <main className="mx-auto grid min-h-full w-[min(100%,60rem)] gap-lg px-lg pt-lg pb-3xl">
          {Array.from({ length: 24 }, (_, index) => (
            <p className="m-0 rounded-card bg-paper p-md text-ink" key={index}>
              Line {index + 1} — the last of these must be readable, not trapped.
            </p>
          ))}
        </main>
      </AppFrame.Scrolls>
      <AppFrame.Floats>
        {bar === "none" ? null : (
          <div
            data-task-bar={bar}
            className="ms-auto me-lg mb-lg grid w-[min(30rem,calc(100vw-2*var(--spacing-lg)))] gap-xs rounded-card border border-rule bg-paper p-md shadow-raised"
          >
            <strong className="text-ink">Creating the classwork — Trillions</strong>
            {bar === "open" ? (
              <>
                <span className="text-sm text-ink-secondary">A card the height of the real one.</span>
                <span className="text-sm text-ink-secondary">With a second line, as it has.</span>
              </>
            ) : null}
          </div>
        )}
      </AppFrame.Floats>
    </AppFrame>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(<Shell />);
