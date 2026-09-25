import type { ComponentProps } from "react";
import type ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownProps = ComponentProps<typeof ReactMarkdown>;

export const MARKDOWN_REMARK_PLUGINS: NonNullable<
  MarkdownProps["remarkPlugins"]
> = [remarkGfm, remarkMath];

// Model output echoes learner input: never enable KaTeX `trust`, which turns
// `\href{javascript:...}` into a live link. Shared so no surface re-enables it.
export const MARKDOWN_REHYPE_PLUGINS: NonNullable<
  MarkdownProps["rehypePlugins"]
> = [
  [
    rehypeKatex,
    // Unparsable formulas show as source in the text colour; red reads as the learner's error.
    { strict: false, throwOnError: false, errorColor: "inherit" },
  ],
];
