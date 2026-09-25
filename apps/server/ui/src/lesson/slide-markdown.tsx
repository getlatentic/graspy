import { useMemo, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { Markdown } from "@/shared/markdown";

function heading({ children }: { children?: ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold text-ink">{children}</h3>;
}

const BLOCK_COMPONENTS: Components = {
  // The slide already has its title; headings inside it are sub-points.
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  ul: ({ children }) => (
    <ul className="list-disc space-y-2 ps-6 marker:text-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 ps-6 marker:text-muted">
      {children}
    </ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-control bg-raised p-4 text-sm">
      {children}
    </pre>
  ),
  // A wide table scrolls in its own box rather than stretching the lesson
  // past a phone's screen.
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full border-collapse text-sm leading-6">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="min-w-32 border-b border-line bg-raised px-3 py-2 text-start align-bottom font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="min-w-32 border-b border-line px-3 py-2 text-start align-top">
      {children}
    </td>
  ),
};

// The server fences TikZ, but no renderer for it is loaded. Shown as source,
// and as text rather than markup because a model wrote it.
function TikzSource({ source, caption }: { source: string; caption: string }) {
  return (
    <figure className="my-2">
      <figcaption className="mb-1 text-xs uppercase tracking-wider text-muted">
        {caption}
      </figcaption>
      <pre className="overflow-x-auto rounded-control bg-raised p-4 text-sm">
        <code>{source}</code>
      </pre>
    </figure>
  );
}

function codeWith(diagramSource: string): Components["code"] {
  return ({ children, className }) => {
    if (className?.includes("language-tikz")) {
      return <TikzSource source={String(children)} caption={diagramSource} />;
    }
    if (className?.includes("language-math")) {
      return <code>{children}</code>;
    }
    return (
      <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-sm">
        {children}
      </code>
    );
  };
}

export function SlideMarkdown({
  source,
  diagramSource,
}: {
  source: string;
  diagramSource: string;
}) {
  const components = useMemo(
    () => ({ ...BLOCK_COMPONENTS, code: codeWith(diagramSource) }),
    [diagramSource],
  );
  return (
    <div dir="auto" className="space-y-4 text-base leading-7 text-ink">
      <Markdown source={source} components={components} />
    </div>
  );
}
