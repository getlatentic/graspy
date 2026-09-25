// rehype-katex reads only $…$ and $$…$$; the model also writes graspy's
// <latex-*> tags and LaTeX's own \(…\) and \[…\].
const DELIMITERS: [RegExp, string][] = [
  [/<\/?latex-block>/g, "$$$$"],
  [/<\/?latex-inline>/g, "$"],
  [/\\[[\]]/g, "$$$$"],
  [/\\[()]/g, "$"],
];

export function processLatex(content: string): string {
  return DELIMITERS.reduce(
    (text, [pattern, delimiter]) => text.replace(pattern, delimiter),
    content,
  );
}
