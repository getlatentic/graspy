import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { PastedPlanFields } from "../../features/lesson-planning/ui/PastedPlanFields";
import type { ModelAcquisitionGateway } from "../../features/model-acquisition/application/ModelAcquisitionGateway";
import { PhotographReadingSetup } from "../../features/model-acquisition/ui/PhotographReadingSetup";

/** A page shaped like the photographs this reads: portrait, ruled, written on. */
const A_PAGE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 1280">
     <rect width="960" height="1280" fill="#fdfcf7"/>
     ${Array.from({ length: 26 }, (_, line) => {
       const y = 90 + line * 44;
       return `<line x1="60" y1="${y}" x2="900" y2="${y}" stroke="#c6d4e4" stroke-width="2"/>
               <rect x="${72 + (line % 3) * 18}" y="${y - 22}" width="${
                 380 + ((line * 97) % 420)
               }" height="14" fill="#2b3a67" opacity="0.72" rx="4"/>`;
     }).join("")}
   </svg>`,
)}`;

const READ_OFF_IT = [
  "WEEK: 2",
  "DATE: 4TH - 8TH MAY, 2026",
  "CLASS: JSS1",
  "TOPIC: ANGLES (PLANE SHAPES I)",
  "Behavioural objectives: By the end of the lesson students should be able to measure:",
  "(i) measure angles",
  "(ii) identify vertically opposite, adjacent, alternate and corresponding angles",
].join("\n");

/** A machine that has not got what reading a photograph takes. */
const notSetUpYet: ModelAcquisitionGateway = {
  getInstallation: () =>
    Promise.resolve({
      state: "absent",
      downloadedBytes: 0,
      totalBytes: 557_368_064,
      artifactLicense: "Apache-2.0",
      artifactLicenseUrl: "https://example.com/licence",
      upstreamTermsUrl: "https://example.com/terms",
    }),
  download: () => new Promise(() => {}),
  chooseImportFile: () => Promise.resolve(null),
  importFile: () => new Promise(() => {}),
  cancel: () => Promise.resolve(),
  subscribe: () => Promise.resolve(() => {}),
};

export function Page() {
  const [text, setText] = useState(READ_OFF_IT);
  const [page, setPage] = useState<string | null>(A_PAGE);
  const [readable, setReadable] = useState(true);
  return (
    <main className="mx-auto grid max-w-[76rem] gap-xl p-lg">
      <PastedPlanFields
        text={text}
        onTextChange={setText}
        pending={false}
        bringingIn={{
          bringingIn: null,
          outcome: { kind: "read", fileName: "lesson-plan-1.jpeg" },
          page,
          importDocument: () => setReadable(false),
          readPhotograph: () => setPage(A_PAGE),
          stopReading: () => {},
        }}
        offering={{ document: true, photograph: readable }}
        settingUpPhotographs={
          <PhotographReadingSetup gateway={notSetUpYet} onReady={() => setReadable(true)} />
        }
      />
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(<Page />);
