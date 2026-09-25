/** Rewrites the tutor's formula delimiters into the $$ and $ that remark-math reads. */
export function processLatex(content: string): string {
  return content
    .replace(/<latex-block>/g, "$$$$")
    .replace(/<\/latex-block>/g, "$$$$")
    .replace(/<latex-inline>/g, "$")
    .replace(/<\/latex-inline>/g, "$")
    .replace(/\\\[/g, "$$$$")
    .replace(/\\\]/g, "$$$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}
