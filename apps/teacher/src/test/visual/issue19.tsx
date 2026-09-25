import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import type { ClassworkExportGateway } from "../../features/document-export/application/ClassworkExportGateway";
import { ClassworkExportDialog } from "../../features/document-export/ui/ClassworkExportDialog";

const paper = `<!doctype html><html lang="en"><head><style>
  @page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}html{background:#e8eef3}body{width:210mm;min-height:297mm;margin:8mm auto;padding:18mm 16mm;background:#fff;color:#101820;font:16px/1.55 Nunito,sans-serif}header{border-bottom:1px solid #b8c7d4;padding-bottom:16px}h1{font-size:34px;line-height:1.08}dl{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}dt{font-size:12px;font-weight:800;color:#52677b}dd{margin:0}section{margin-top:32px}article{break-inside:avoid;border-top:1px solid #d9e2e9;padding:18px 0}h2,h3{line-height:1.2}small{color:#52677b}@media(max-width:760px){body{width:100%;margin:0;padding:24px 18px}dl{grid-template-columns:1fr}}
</style></head><body><header><small>STUDENT COPY · ORIGINAL LESSON MATERIALS</small><h1>Equivalent fractions</h1><dl><div><dt>Class</dt><dd>Mathematics · JSS 2</dd></div><div><dt>Academic session</dt><dd>2026/2027</dd></div><div><dt>Term</dt><dd>First term</dd></div><div><dt>Prepared</dt><dd>18 July 2026</dd></div></dl></header><section><h2>Learning goals</h2><ol><li>Compare equivalent fractions using models.</li><li>Explain why equivalent fractions name the same amount.</li></ol></section><section><small>LESSON STEP 1</small><h2>Seeing the same amount</h2><article><h3>Review</h3><p>Equivalent fractions name the same amount even when the numerator and denominator are different.</p></article><article><h3>Worked example</h3><p>Place a one-half strip above two one-quarter strips. Their lengths match, so 1/2 = 2/4.</p></article><article><h3>Practice</h3><p>Use fraction strips to decide whether 3/6 and 1/2 are equivalent. Explain what you notice.</p></article></section><section><h2>Source notes</h2><p>Siyavula Mathematics. Creative Commons Attribution 3.0 Unported.</p></section><script>parent.postMessage('graspy:export-ready','*')</script></body></html>`;

const fixture = new URLSearchParams(location.search).get("fixture") ?? "ready";
const gateway: ClassworkExportGateway = {
  prepare: async () => {
    if (fixture === "loading") await new Promise(() => undefined);
    if (fixture === "error") throw new Error("The approved lesson changed while this copy was being prepared.");
    return { title: "Equivalent fractions - Classwork", fileName: "equivalent-fractions-student.pdf", html: paper };
  },
  choosePdfDestination: async () => fixture === "cancelled" ? null : "/Volumes/USB/equivalent-fractions-student.pdf",
  savePdf: async () => ({ path: "/Volumes/USB/equivalent-fractions-student.pdf", fileName: "equivalent-fractions-student.pdf", byteSize: 42_116 }),
  print: async () => undefined,
};

const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(
  <main style={{ minHeight: "100dvh", padding: "var(--spacing-lg)", background: "var(--color-canvas)" }}>
    <h1 style={{ fontFamily: "var(--font-display)", marginBlockStart: 0 }}>Approved classwork</h1>
    <p>Equivalent fractions · Mathematics · JSS 2</p>
    <ClassworkExportDialog
      context={{ academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" }}
      gateway={gateway}
      lessonId="lesson"
      classworkSet="original"
    />
  </main>,
);
setTimeout(() => (document.querySelector<HTMLButtonElement>("button")?.click()), 50);
