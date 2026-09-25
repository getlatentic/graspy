import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { processLatex } from "./latex";
import "katex/dist/katex.min.css";
import "katex/dist/contrib/mhchem.mjs";

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm, remarkMath];

// KaTeX's `trust` stays off: the model repeats what a learner types, and
// trust would render `\href{javascript:...}{x}` as a live link. errorColor
// inherits because KaTeX's red would read as the learner's mistake.
const REHYPE_PLUGINS: Options["rehypePlugins"] = [
  [rehypeKatex, { strict: false, throwOnError: false, errorColor: "inherit" }],
];

export function Markdown({
  source,
  components,
}: {
  source: string;
  components: Components;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {processLatex(source)}
    </ReactMarkdown>
  );
}

const INLINE: Components = {
  p: ({ children }) => <span>{children}</span>,
};

export function InlineMarkdown({ source }: { source: string }) {
  return <Markdown source={source} components={INLINE} />;
}
