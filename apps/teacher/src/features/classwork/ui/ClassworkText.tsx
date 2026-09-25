import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// Built once. A lesson's classwork renders one of these per block, and fresh
// arrays here are fresh props to the markdown renderer on every keystroke.
const MATHEMATICS_IN_MARKDOWN = [remarkMath];
const MATHEMATICS_AS_HTML = [rehypeKatex];
// A section cites its figures by name; an <img> in the text would be the model
// reaching for one that was never supplied.
const NO_INLINE_IMAGES = { img: () => null };

interface ClassworkTextProps {
  readonly text: string;
}
export function ClassworkText({ text }: ClassworkTextProps) {
  return (
    <div className="classwork-content min-w-0 max-w-[var(--classwork-measure,65ch)] text-base leading-body text-ink [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_li+li]:mt-xs [&_pre]:overflow-x-auto [&_.katex-display]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={MATHEMATICS_IN_MARKDOWN}
        rehypePlugins={MATHEMATICS_AS_HTML}
        skipHtml
        components={NO_INLINE_IMAGES}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
