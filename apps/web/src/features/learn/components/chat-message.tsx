import type { ReactNode } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import "katex/dist/katex.min.css";
import "katex/dist/contrib/mhchem.mjs";
import { processLatex } from "@/lib/latex";
import type { ChatMessage } from "@/lib/chat-db";
import { useI18n } from "@/lib/i18n-context";
import { SproutMark } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn } from "@/lib/cn";
import {
  MARKDOWN_REHYPE_PLUGINS,
  MARKDOWN_REMARK_PLUGINS,
} from "@/features/learn/lib/markdown-plugins";

const heading = ({ children }: { children?: ReactNode }) => (
  <p className="font-semibold">{children}</p>
);

const REPLY: Components = {
  // Scrolls in its own box rather than stretching the reply past a phone's screen.
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
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 ps-5">{children}</ul>
  ),
  ol: ({ children }) => <ol className="reply-steps space-y-3">{children}</ol>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-ink underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className="block overflow-x-auto rounded-control bg-raised p-3 text-sm">
        {children}
      </code>
    ) : (
      <code className="rounded bg-raised px-1 py-0.5 text-sm">{children}</code>
    ),
};

export function ChatMessageItem({ message }: { message: ChatMessage }) {
  if (message.type === "complete") return <AppNote message={message} />;
  if (message.type === "error") {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 text-sm text-danger"
        dir="auto"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {message.content}
      </p>
    );
  }
  if (message.sender === "user") {
    return (
      <div className="flex justify-end">
        <p
          dir="auto"
          className="max-w-5/6 whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-ee-md bg-accent-soft px-4 py-2.5 text-base text-ink lg:text-sm"
        >
          {message.content}
        </p>
      </div>
    );
  }
  return <TutorReply content={message.content} />;
}

/** Links to where the change shows; the conversation never leaves on its own. */
function AppNote({ message }: { message: ChatMessage }) {
  const link = message.metadata?.link;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="flex w-fit max-w-full items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span dir="auto">{message.content}</span>
      </p>
      {link && (
        <Link
          to={link.to}
          className={cn(
            buttonStyles("primary", "sm"),
            "rounded-full px-4 py-2",
          )}
        >
          {link.label}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function TutorReply({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      <TutorName />
      <div
        dir="auto"
        className="space-y-3 wrap-anywhere text-base leading-7 text-ink lg:text-sm lg:leading-6"
      >
        <ReactMarkdown
          remarkPlugins={MARKDOWN_REMARK_PLUGINS}
          rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
          components={REPLY}
        >
          {processLatex(content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function TutorName() {
  const { t } = useI18n();
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-muted">
      <SproutMark className="h-4" />
      {t("chat.aiTutorTitle")}
    </p>
  );
}
